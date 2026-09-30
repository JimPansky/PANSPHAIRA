"""Fixed, synthetic PAN464 native Superset jobs; no acceptance decision here.
Expected business decisions and the host admission/journal are NOT writable here.
This job never reads expected values; the independent controller compares these
actual HTTP observations.
"""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import sys
import threading

import requests

assert len(sys.argv) == 2, 'PAN464_CONSUMER_ARGUMENTS_DENIED'
mode = sys.argv[1]
assert mode in ('seed', 'install', 'observe', 'wrong-business', 'new-write'), 'PAN464_CONSUMER_MODE_DENIED'
assert importlib.metadata.version('apache-superset') == '6.1.0', 'PAN464_SUPERSET_VERSION_DENIED'
state = Path('/state/consumer')
keys = Path('/state/keys')
ks = Path('/ks')
metadata = state / 'metadata/superset.db'
projection = state / 'projection/analytics.db'
os.environ.update(CHIMPMAERA_BI_ROOT=str(state), CHIMPMAERA_BI_SECRET_ROOT=str(keys),
                  SUPERSET_CONFIG_PATH=str(ks / 'services/superset/runtime/superset_config.py'),
                  SUPERSET_BIN='/app/.venv/bin/superset', PYTHON_BIN=sys.executable)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def install():
    before = digest(metadata) if metadata.exists() else None
    with Path('/state/native-install.log').open('w') as log:
        p = subprocess.run(['bash', str(ks / 'services/superset/runtime/init.sh'), 'install'],
                           stdout=log, stderr=subprocess.STDOUT, timeout=180)
    assert p.returncode == 0, 'PAN464_NATIVE_INSTALL_FAILED'
    receipts = [json.loads(p.read_text()) for p in (state / 'metadata').rglob('install.receipt.json')]
    if before is not None:
        assert any(r['base'].get('sha256') == before and r['base']['source'] == 'LIVE_PATH'
                   for r in receipts), 'PAN464_RETAINED_SEED_NOT_OBSERVED'
    with sqlite3.connect(metadata) as conn:
        revision = conn.execute('SELECT version_num FROM alembic_version').fetchone()[0]
    Path('/state/native-install-observed.json').write_text(json.dumps({
        'nativeExit': p.returncode, 'baseSha256': before, 'alembicRevision': revision,
        'migrationMeaning': 'ACTUAL_DB_UPGRADE_COMMAND_SCHEMA_CHANGE_NOT_ASSERTED'}) + '\n')


if mode == 'seed':
    assert not state.exists() and not keys.exists(), 'PAN464_FRESH_SEED_OVERWRITE_DENIED'
    (state / 'projection').mkdir(parents=True)
    keys.mkdir(mode=0o700)
    for name in ('superset_secret_key', 'superset_admin_password', 'superset_analyst_password'):
        path = keys / name
        path.write_text(secrets.token_hex(24))
        path.chmod(0o600)
    install()
else:
    assert metadata.exists(), 'PAN464_RETAINED_METADATA_REQUIRED'
    if mode == 'install':
        install()
        sys.exit(0)

# Observations refresh ONLY the explicitly materialized projection from the
# separately observed real PAN database. No literal business expectations here.
if mode in ('seed', 'observe', 'new-write'):
    producer = json.loads(Path('/state/producer-observed.json').read_text())
    with sqlite3.connect(projection) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS pan464_invoices (invoice_id TEXT PRIMARY KEY, amount_minor INTEGER NOT NULL)')
        conn.execute('DELETE FROM pan464_invoices')
        conn.executemany('INSERT INTO pan464_invoices VALUES (?,?)',
                         [(r['invoiceId'], r['amountMinor']) for r in producer['rows']])

from superset.app import create_app
from superset import db
from werkzeug.serving import make_server

app = create_app()
with app.app_context():
    from superset.connectors.sqla.models import SqlaTable, TableColumn, SqlMetric
    from superset.models.core import Database
    from superset.models.dashboard import Dashboard
    if mode == 'seed':
        database = db.session.query(Database).filter_by(database_name='ChimpMaera BI managed projection').one()
        database.sqlalchemy_uri = 'sqlite:///' + str(projection)
        dataset = SqlaTable(table_name='pan464_invoices', database=database)
        dataset.columns = [TableColumn(column_name='invoice_id', type='TEXT', groupby=True),
                           TableColumn(column_name='amount_minor', type='INTEGER', groupby=True)]
        dataset.metrics = [SqlMetric(metric_name='total_minor', expression='SUM(amount_minor)'),
                           SqlMetric(metric_name='invoice_count', expression='COUNT(*)')]
        db.session.add(dataset)
        dashboard = Dashboard(dashboard_title='PAN464 synthetic retained invoice view')
        db.session.add(dashboard)
        db.session.commit()
    dataset = db.session.query(SqlaTable).filter_by(table_name='pan464_invoices').one()
    dashboard = db.session.query(Dashboard).filter_by(dashboard_title='PAN464 synthetic retained invoice view').one()
    dataset_id, dashboard_id = dataset.id, dashboard.id
    if mode == 'wrong-business':
        metric = db.session.query(SqlMetric).filter_by(table_id=dataset_id, metric_name='total_minor').one()
        metric.expression = 'SUM(amount_minor)+1'
        db.session.commit()
    if mode == 'new-write':
        db.session.add(Dashboard(dashboard_title='PAN464 valid post-activation work'))
        db.session.commit()
    later_dashboards = db.session.query(Dashboard).filter_by(dashboard_title='PAN464 valid post-activation work').count()

server = make_server('127.0.0.1', 0, app, threaded=True)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
client = requests.Session()
client.trust_env = False
url = 'http://127.0.0.1:' + str(server.server_port)
try:
    health = client.get(url + '/health', timeout=10)
    assert health.status_code == 200, 'PAN464_NATIVE_HEALTH_DENIED'
    login = client.post(url + '/api/v1/security/login', json={
        'username': 'cm_admin', 'password': (keys / 'superset_admin_password').read_text(),
        'provider': 'db', 'refresh': True}, timeout=20)
    assert login.status_code == 200, 'PAN464_NATIVE_LOGIN_DENIED'
    client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
    csrf = client.get(url + '/api/v1/security/csrf_token/', timeout=20)
    assert csrf.status_code == 200, 'PAN464_NATIVE_CSRF_DENIED'
    client.headers['X-CSRFToken'] = csrf.json()['result']
    response = client.post(url + '/api/v1/chart/data', json={
        'datasource': {'id': dataset_id, 'type': 'table'}, 'force': True,
        'queries': [{'columns': [], 'metrics': ['total_minor', 'invoice_count'],
                     'row_limit': 10, 'filters': [], 'time_range': 'No filter'}],
        'result_format': 'json', 'result_type': 'full'}, timeout=30)
    assert response.status_code == 200, 'PAN464_NATIVE_CHART_QUERY_DENIED'
    result = response.json()['result'][0]
    assert result['status'] == 'success', 'PAN464_NATIVE_QUERY_NOT_SUCCESS'
    observed = {'healthStatus': health.status_code, 'httpStatus': response.status_code,
                'data': result['data'], 'datasetId': dataset_id, 'dashboardId': dashboard_id,
                'postActivationDashboards': later_dashboards}
    Path('/state/consumer-observed.json').write_text(json.dumps(observed) + '\n')
finally:
    client.close()
    server.shutdown()
    thread.join(timeout=10)
    server.server_close()
    with app.app_context():
        db.session.remove()
        db.engine.dispose()

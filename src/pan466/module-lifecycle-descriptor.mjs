// LIFE-06 optional descriptor metadata. Declaration/integrity is NOT authority,
// qualified compatibility, automatic execution or repository-wide coverage.
const id = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value);
const version = value => typeof value === 'string' && value.length > 0
  && value.length <= 128 && !/[\u0000-\u001f\u007f]/.test(value);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
function deny(code) { throw new Error(code); }
export function lifecyclePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')
    || value !== value.normalize('NFC') || value.startsWith('-') || /^[A-Za-z]:/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) deny('LIFECYCLE_PATH_DENIED');
  return value;
}
export function validateModuleLifecycles(modules, view, { advisory = false } = {}) {
  const migrations = new Set();
  const stateOwners = new Map();
  for (const module of modules) {
    if (!Object.hasOwn(module, 'lifecycle')) continue;
    const l = module.lifecycle;
    if (!exact(l, ['schemaVersion', 'state', 'migrations', 'consumers', 'recovery']) || l.schemaVersion !== 1
      || !exact(l.state, ['content', 'config', 'derived', 'authority'])
      || !Array.isArray(l.migrations) || !Array.isArray(l.consumers)
      || !exact(l.recovery, ['history', 'deferred']) || l.recovery.history !== 'APPEND_ONLY'
      || l.recovery.deferred !== 'REVALIDATE_CURRENT') deny('LIFECYCLE_SCHEMA_DENIED');
    for (const [kind, declared] of Object.entries(l.state)) {
      if (!Array.isArray(declared) || new Set(declared).size !== declared.length) deny('LIFECYCLE_STATE_DENIED');
      const paths = declared.flatMap(path => view.files(lifecyclePath(path))).sort();
      for (const path of paths) {
        lifecyclePath(path);
        if (stateOwners.has(path)) deny('LIFECYCLE_STATE_OWNERSHIP_CONFLICT');
        stateOwners.set(path, { module: module.id, kind });
      }
      module.files['lifecycle' + kind[0].toUpperCase() + kind.slice(1)] = paths;
    }
    const migrationPaths = [];
    for (const m of l.migrations) {
      if (!exact(m, ['id', 'from', 'to', 'path']) || !id(m.id) || !version(m.from)
        || !version(m.to) || m.from === m.to) deny('LIFECYCLE_MIGRATION_DENIED');
      if (migrations.has(m.id)) deny('LIFECYCLE_MIGRATION_ID_REUSED');
      migrations.add(m.id);
      migrationPaths.push(...view.files(lifecyclePath(m.path)));
    }
    module.files.lifecycleMigrations = [...new Set(migrationPaths)].sort();
    const consumers = new Set();
    for (const c of l.consumers) {
      if (!exact(c, ['id', 'version']) || !id(c.id) || !version(c.version) || consumers.has(c.id)) {
        deny('LIFECYCLE_CONSUMER_DENIED');
      }
      consumers.add(c.id);
      const known = modules.find(m => m.id === c.id);
      // Advisory impact must still be able to describe deleted/dangling graphs;
      // check/release/verify never accept their lifecycle as current coverage.
      if (!advisory && (!known || known.id === module.id || known.version !== c.version
        || known.dependencies[module.id] !== module.version)) deny('LIFECYCLE_CONSUMER_UNKNOWN');
    }
    if (!advisory) {
      const expected = modules.filter(m => Object.hasOwn(m.dependencies, module.id)).map(m => m.id);
      if (expected.some(consumer => !consumers.has(consumer))) deny('LIFECYCLE_CONSUMER_INCOMPLETE');
    }
  }
}

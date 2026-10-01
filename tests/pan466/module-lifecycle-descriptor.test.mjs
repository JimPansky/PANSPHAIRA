import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = resolve(import.meta.dirname, '../../scripts/module-contribution.mjs');
const descriptor = 'examples/module-contribution/modules.json';
function put(root, path, value) {
  mkdirSync(resolve(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pan466-descriptor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  git('init', '-q'); git('config', 'user.name', 'Synthetic'); git('config', 'user.email', 'synthetic@example.invalid');
  const modules = ['provider', 'consumer'].map(id => ({ id, version: '1',
    sources: [`${id}/source.mjs`], contracts: [`${id}/contract.json`], profiles: [],
    tests: [`${id}/test.mjs`], dependencies: id === 'consumer' ? { provider: '1' } : {} }));
  for (const m of modules) {
    put(root, m.sources[0], 'export const value = 1;');
    put(root, m.contracts[0], { schemaVersion: 1 });
    put(root, m.tests[0], 'export {};');
  }
  put(root, 'provider/content.json', { label: 'original content' });
  put(root, 'provider/config.json', { display: 'compact' });
  put(root, 'provider/index.json', { generation: 1 });
  put(root, 'provider/authority.json', { granted: false });
  put(root, 'provider/migration.mjs', 'export const version = 2;');
  const lifecycle = { schemaVersion: 1,
    state: { content: ['provider/content.json'], config: ['provider/config.json'],
      derived: ['provider/index.json'], authority: ['provider/authority.json'] },
    migrations: [{ id: 'provider-1-to-2', from: '1', to: '2', path: 'provider/migration.mjs' }],
    consumers: [{ id: 'consumer', version: '1' }],
    recovery: { history: 'APPEND_ONLY', deferred: 'REVALIDATE_CURRENT' } };
  modules[0].lifecycle = structuredClone(lifecycle);
  const save = () => put(root, descriptor, { schemaVersion: 1, modules });
  save(); git('add', '.'); git('commit', '-qm', 'synthetic lifecycle baseline');
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
  return { root, modules, lifecycle, save, run };
}
function json(r) { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); }

test('LIFE-06-AC01: actual descriptor entry point rejects an unknown direct lifecycle consumer', t => {
  const f = fixture(t); f.modules[0].lifecycle.consumers[0].id = 'unknown-consumer'; f.save();
  const r = f.run('check'); assert.notEqual(r.status, 0, 'unknown consumer silently accepted');
  assert.match(r.stderr, /LIFECYCLE_CONSUMER_UNKNOWN/);
});
test('LIFE-06-AC01: actual descriptor rejects reused migration identities', t => {
  const f = fixture(t); f.modules[0].lifecycle.migrations.push({ ...f.lifecycle.migrations[0], path: 'provider/source.mjs' }); f.save();
  const r = f.run('check'); assert.notEqual(r.status, 0, 'reused migration ID silently accepted');
  assert.match(r.stderr, /LIFECYCLE_MIGRATION_ID_REUSED/);
});
test('LIFE-06-AC01: complete declared direct consumer set is required, without transitive inference', t => {
  const f = fixture(t); f.modules[0].lifecycle.consumers = []; f.save();
  const r = f.run('check'); assert.notEqual(r.status, 0);
  assert.match(r.stderr, /LIFECYCLE_CONSUMER_INCOMPLETE/);
});
test('LIFE-06: closed optional lifecycle schema rejects silent authority/recovery expansion', t => {
  const f = fixture(t);
  for (const change of [
    l => l.automaticAuthority = true,
    l => l.schemaVersion = 2,
    l => l.state.authority = 'provider/authority.json',
    l => l.state.content = ['../outside'],
    l => l.recovery.history = 'OVERWRITE',
    l => l.recovery.deferred = 'TRUST_SAVED_APPROVAL',
    l => l.consumers[0].version = 'invented',
    l => l.migrations[0].from = l.migrations[0].to,
    l => l.state.content.push('provider/authority.json'),
  ]) {
    f.modules[0].lifecycle = structuredClone(f.lifecycle); change(f.modules[0].lifecycle); f.save();
    assert.notEqual(f.run('check').status, 0, String(change));
  }
});
test('LIFE-06: actual graph/release/verify preserves and binds lifecycle file bytes without granting authority', t => {
  const f = fixture(t); const graph = json(f.run('graph'));
  const provider = graph.modules.find(m => m.id === 'provider');
  assert.deepEqual(provider.files.lifecycleAuthority, ['provider/authority.json']);
  assert.deepEqual(provider.files.lifecycleConfig, ['provider/config.json']);
  assert.deepEqual(provider.files.lifecycleMigrations, ['provider/migration.mjs']);
  const before = json(f.run('release')); put(f.root, 'before.json', before);
  assert.equal(json(f.run('verify', '--manifest', 'before.json')).valid, true);
  put(f.root, 'provider/config.json', { display: 'expanded' });
  assert.notEqual(f.run('verify', '--manifest', 'before.json').status, 0);
  const after = json(f.run('release')); put(f.root, 'after.json', after);
  const comparison = json(f.run('compare', '--before', 'before.json', '--after', 'after.json'));
  assert.deepEqual(comparison.changedModules, ['provider']);
  assert.equal(comparison.advisory, true); assert.match(comparison.notice, /not authentication/);
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, 'before.json'), 'utf8')), before);
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { evaluateErvRelationalCaseV2 } from '../../dist/packages/contracts/src/incoming-invoice-erv-relational-v2.js';

// Meaningful RED against the actually released historical implementation, not
// a missing-import failure. The successor MUST support the original requirement;
// historical v2 source, its 100bps pack and its honest negative tests stay intact.
const successor = resolve('src/pan360/original-erv-core-v1.mjs');
const current = existsSync(successor) ? await import(pathToFileURL(successor).href) : null;
const pack = current
  ? current.loadOriginalErvProfileV1()
  : JSON.parse(readFileSync('tests/fixtures/incoming-invoice/ap-04-erv-relational-cases-v2.json', 'utf8'));
const evaluate = current ? current.evaluateOriginalErvCaseV1 : evaluateErvRelationalCaseV2;

// Exact original AP05 comment5508575190/AP06 comment5508575402:
// LEAN has no mandatory PO/receipt, changed requires both and exactly2percent.
test('360-AC05 original LEAN executes without mandatory PO or receipt', () => {
  const source = structuredClone(pack.cases[0]);
  const lean = pack.variants.matchingModes.find(mode =>
    mode.requiredKinds.includes('INVOICE') && !mode.requiredKinds.includes('PURCHASE_ORDER') && !mode.requiredKinds.includes('RECEIPT'));
  source.references = source.references.filter(ref => !['PURCHASE_ORDER', 'RECEIPT'].includes(ref.body.referenceKind));
  if (lean) source.matchingMode = { variantId: lean.variantId, version: lean.version };
  const observed = evaluate(source, pack);
  assert.equal(observed.outcome, 'MATCHED', JSON.stringify(observed));
  assert.ok(lean, 'no mandatory PO/receipt must be a supported versioned profile, not a waived missing-context result');
  assert.equal(observed.authority.productivePostingAuthorized, false);
  assert.equal(observed.authority.bookingAuthorityGranted, false);
});

test('AP06-AC06 original200bps is actually supported, not historical100bps substituted', () => {
  const registered = pack.variants.tolerancePolicies.find(policy => policy.rateBasisPoints === 200)
    ?? pack.variants.tolerancePolicies.find(policy => policy.variantId === 'RATE_BPS_V1');
  assert.ok(registered, 'a versioned rate variant is required');
  assert.equal(registered.rateBasisPoints, 200, 'the frozen original changed requirement is exactly200basis-points');
  assert.ok(current, 'the new supported profile needs its own source-bound admission; historical100bps must remain historical');
});

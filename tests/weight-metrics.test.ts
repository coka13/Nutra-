import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightMetrics } from '../src/lib/weight-metrics';

test('monthly weight metrics sort check-ins and exclude other months and metrics', () => {
  const records = [
    { kind: 'weight', date: '2026-11-20', value: 74 },
    { kind: 'weight', date: '2026-12-01', value: 73 },
    { kind: 'energy', date: '2026-11-21', value: 4 },
    { kind: 'weight', date: '2026-10-31', value: 80 },
    { kind: 'weight', date: '2026-11-01', value: 76 },
    { kind: 'weight', date: '2026-11-12', value: 75 },
  ];
  const result = weightMetrics(records, '2026-11');
  assert.equal(result.latest?.value, 73);
  assert.equal(result.entries.length, 3);
  assert.equal(result.average, 75);
  assert.equal(result.change, -2);
  assert.equal(records[0].value, 74);
});

test('empty and single-entry months do not imply a measured change', () => {
  const records = [{ kind: 'weight', date: '2026-11-20', value: 75 }];
  const empty = weightMetrics(records, '2026-10');
  assert.equal(empty.latest?.value, 75);
  assert.equal(empty.average, undefined);
  assert.equal(empty.change, undefined);
  const single = weightMetrics(records, '2026-11');
  assert.equal(single.average, 75);
  assert.equal(single.change, undefined);
});

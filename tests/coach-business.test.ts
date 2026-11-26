import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthlyBusiness,
  remainingSessions,
  type BusinessPackage,
} from '../src/lib/coach-business';

test('monthly report separates cash received, package sales and historical balances', () => {
  const pack: BusinessPackage = {
    id: 'p1',
    date: '2026-10-01',
    size: 4,
    price: 100000,
    relationship: { client: { id: 'c', name: 'Client' }, status: 'ACTIVE' },
    sessions: [
      { id: 's1', date: '2026-10-02', status: 'COMPLETED', notes: '' },
      { id: 's2', date: '2026-11-02', status: 'COMPLETED', notes: '' },
      { id: 's3', date: '2026-11-03', status: 'CANCELLED', notes: '' },
      { id: 's4', date: '2026-12-01', status: 'PLANNED', notes: '' },
    ],
    receipts: [
      { id: 'r1', date: '2026-10-01', amount: 25000, method: 'cash', notes: '' },
      { id: 'r2', date: '2026-11-01', amount: 25000, method: 'transfer', notes: '' },
      { id: 'r3', date: '2026-12-01', amount: 50000, method: 'cash', notes: '' },
    ],
  };
  assert.equal(remainingSessions(pack), 2);
  const october = monthlyBusiness([pack], '2026-10');
  assert.equal(october.income, 25000);
  assert.equal(october.sales, 100000);
  assert.equal(october.debt, 75000);
  assert.equal(october.rows[0].remaining, 3);
  const november = monthlyBusiness([pack], '2026-11');
  assert.equal(november.income, 25000);
  assert.equal(november.sales, 0);
  assert.equal(november.debt, 50000);
  assert.equal(november.completed, 1);
  assert.equal(november.cancelled, 1);
  assert.equal(november.planned, 0);
  assert.equal(november.activeClients, 1);
  assert.equal(november.packagesSold, 0);
  assert.equal(monthlyBusiness([pack], '2026-09').rows.length, 0);
});

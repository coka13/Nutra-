import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setMetrics, reachedLiveRecord } from '../src/lib/performance';

test('live records trigger on improvements, exclude unfinished sets and do not repeat unchanged saves', () => {
  const first = { completed: true, weight: 20, reps: 10 };
  const before = setMetrics([]);
  const after = setMetrics([first, { completed: false, weight: 500, reps: 100 }]);
  const prior = { weight: 10, reps: 10, estimate: 15, volume: 100 };
  assert.equal(after.weight, 20);
  assert.equal(after.volume, 200);
  assert(reachedLiveRecord(before, after, prior));
  assert(!reachedLiveRecord(after, after, prior));
  assert(reachedLiveRecord(after, setMetrics([first, { ...first, weight: 25 }]), prior));
  assert(!reachedLiveRecord(after, setMetrics([{ ...first, weight: 15 }]), prior));
});

test('session volume celebrates the first crossing and bodyweight rep records work', () => {
  const prior = { weight: 20, reps: 10, estimate: 30, volume: 300 };
  const set = { completed: true, weight: 20, reps: 10 };
  assert(reachedLiveRecord(setMetrics([set]), setMetrics([set, set]), prior));
  assert(!reachedLiveRecord(setMetrics([set, set]), setMetrics([set, set, set]), prior));
  assert(reachedLiveRecord(setMetrics([]), setMetrics([{ ...set, weight: 0, reps: 11 }]), prior));
});

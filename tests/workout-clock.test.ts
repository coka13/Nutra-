import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentWorkout, workoutClockTransition, workoutMillis } from '../src/lib/workout-clock';

test('workout clock saves fractional segments and excludes time spent paused', () => {
  const initial = {
    status: 'ACTIVE',
    elapsedSeconds: 0,
    elapsedMilliseconds: 0,
    lastResumedAt: new Date(1000),
  };
  assert.equal(workoutMillis(initial, 1000), 0);
  const paused = { status: 'PAUSED', ...workoutClockTransition(initial, new Date(1720)) };
  assert.equal(workoutMillis(paused, 18000), 720);
  const resumed = { status: 'ACTIVE', ...workoutClockTransition(paused, new Date(18000)) };
  const finished = workoutClockTransition(resumed, new Date(18500));
  assert.equal(finished.elapsedMilliseconds, 1220);
  assert.equal(finished.elapsedSeconds, 1);
});

test('legacy durations recover and a running session takes precedence over paused sessions', () => {
  const legacy = {
    status: 'ACTIVE',
    elapsedSeconds: 38,
    elapsedMilliseconds: null,
    lastResumedAt: new Date(1000),
  };
  assert.equal(workoutMillis(legacy, 3000), 40000);
  assert.equal(currentWorkout([{ status: 'PAUSED' }, legacy]), legacy);
});

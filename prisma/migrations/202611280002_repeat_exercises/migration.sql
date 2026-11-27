-- Let a workout plan list the same exercise more than once: live sets are keyed by plan position.
-- The new key contains the old one, so every existing row already satisfies it.
DROP INDEX "WorkoutSet_sessionId_exerciseId_setIndex_key";
CREATE UNIQUE INDEX "WorkoutSet_sessionId_position_exerciseId_setIndex_key" ON "WorkoutSet"("sessionId", "position", "exerciseId", "setIndex");

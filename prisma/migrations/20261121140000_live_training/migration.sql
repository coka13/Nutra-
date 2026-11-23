ALTER TABLE "WorkoutSession" ADD COLUMN "restUntil" DATETIME;
ALTER TABLE "WorkoutSession" ADD COLUMN "restRemaining" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkoutSet" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkoutSet" ADD COLUMN "restSeconds" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "WorkoutSet" ADD COLUMN "rpe" REAL;
ALTER TABLE "Notification" ADD COLUMN "detail" TEXT NOT NULL DEFAULT '';
UPDATE WorkoutSet SET (position, restSeconds) = (
  SELECT COALESCE(MAX(p.position),0), COALESCE(MAX(p.rest),60)
  FROM WorkoutSession w JOIN ProgramExercise p ON p.programId=w.programId
  WHERE w.id=WorkoutSet.sessionId AND p.exerciseId=WorkoutSet.exerciseId
);
CREATE TABLE ProgressPhoto (
  id TEXT PRIMARY KEY NOT NULL, userId TEXT NOT NULL, image BLOB NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX ProgressPhoto_userId_createdAt_idx ON ProgressPhoto(userId,createdAt);
CREATE TABLE ExercisePerformance (
  sessionId TEXT NOT NULL REFERENCES WorkoutSession(id) ON DELETE CASCADE,
  exerciseId TEXT NOT NULL REFERENCES Exercise(id), userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  weight REAL NOT NULL, reps INTEGER NOT NULL, estimate REAL NOT NULL, volume REAL NOT NULL,
  finishedAt DATETIME NOT NULL, PRIMARY KEY(sessionId, exerciseId)
);
CREATE INDEX performance_user_exercise ON ExercisePerformance(userId,exerciseId,finishedAt);
INSERT INTO ExercisePerformance
SELECT w.id,s.exerciseId,w.userId,MAX(s.weight),MAX(s.reps),
       MAX(CASE WHEN s.reps=1 THEN s.weight ELSE s.weight*(1+s.reps/30.0) END),
       SUM(s.reps*s.weight),COALESCE(w.finishedAt,w.startedAt)
FROM WorkoutSession w JOIN WorkoutSet s ON w.id=s.sessionId
WHERE w.status='FINISHED' AND s.completed AND s.reps>0 GROUP BY w.id,s.exerciseId;

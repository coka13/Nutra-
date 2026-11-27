-- Repetition ranges and per-exercise notes for workout plans (additive; existing rows keep a single rep target).
ALTER TABLE "ProgramExercise" ADD COLUMN "repsMax" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProgramExercise" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

-- The eater chooses which plans are active; only active plans appear in the diary.
ALTER TABLE "MealPlan" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Checks can now be per meal. '' = the whole menu (plans with notes only).
CREATE TABLE "new_MealPlanCheck" (
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "meal" TEXT NOT NULL DEFAULT '',
  PRIMARY KEY ("planId", "userId", "date", "meal"),
  FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MealPlanCheck" ("planId", "userId", "date", "meal")
  SELECT "planId", "userId", "date", '' FROM "MealPlanCheck";
DROP TABLE "MealPlanCheck";
ALTER TABLE "new_MealPlanCheck" RENAME TO "MealPlanCheck";
CREATE INDEX "MealPlanCheck_userId_date_idx" ON "MealPlanCheck"("userId", "date");

ALTER TABLE "Profile" ADD COLUMN "heightCm" REAL;
ALTER TABLE "Profile" ADD COLUMN "birthYear" INTEGER;
ALTER TABLE "MealPlan" ADD COLUMN "menuWeekday" INTEGER;
CREATE TABLE "MealPlanCheck" (
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  PRIMARY KEY ("planId", "userId", "date"),
  FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MealPlanCheck_userId_date_idx" ON "MealPlanCheck"("userId","date");


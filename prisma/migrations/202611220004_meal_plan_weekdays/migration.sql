-- Meal plans can repeat on several weekdays. NULL = every day of the week.
ALTER TABLE "MealPlan" ADD COLUMN "menuWeekdays" TEXT;
UPDATE "MealPlan" SET "menuWeekdays" = CAST("menuWeekday" AS TEXT) WHERE "menuWeekday" IS NOT NULL;
ALTER TABLE "MealPlan" DROP COLUMN "menuWeekday";

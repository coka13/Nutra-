-- Daily active calories (kcal) and distance (km) synced from Apple Health / Health Connect.
ALTER TABLE "DailySteps" ADD COLUMN "activeCalories" INTEGER;
ALTER TABLE "DailySteps" ADD COLUMN "distanceKm" REAL;

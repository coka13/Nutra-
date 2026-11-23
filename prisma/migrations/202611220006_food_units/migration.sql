-- AlterTable
ALTER TABLE "MealEntry" ADD COLUMN "quantity" REAL;
ALTER TABLE "MealEntry" ADD COLUMN "unitEn" TEXT;
ALTER TABLE "MealEntry" ADD COLUMN "unitHe" TEXT;

-- AlterTable
ALTER TABLE "MealPlanItem" ADD COLUMN "quantity" REAL;
ALTER TABLE "MealPlanItem" ADD COLUMN "unitEn" TEXT;
ALTER TABLE "MealPlanItem" ADD COLUMN "unitHe" TEXT;

-- CreateTable
CREATE TABLE "FoodUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "foodId" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "grams" REAL NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FoodUnit_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FoodUnit_foodId_idx" ON "FoodUnit"("foodId");


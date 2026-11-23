-- A diary entry created by ticking a food in the active plan points back at that plan item.
-- SQLite cannot add a foreign key with ALTER TABLE, so the table is rebuilt.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MealEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "foodId" TEXT NOT NULL,
  "grams" REAL NOT NULL,
  "quantity" REAL,
  "unitHe" TEXT,
  "unitEn" TEXT,
  "meal" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "planItemId" TEXT,
  CONSTRAINT "MealEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MealEntry_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MealEntry_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "MealPlanItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MealEntry" ("id", "userId", "foodId", "grams", "quantity", "unitHe", "unitEn", "meal", "date", "createdAt")
  SELECT "id", "userId", "foodId", "grams", "quantity", "unitHe", "unitEn", "meal", "date", "createdAt" FROM "MealEntry";
DROP TABLE "MealEntry";
ALTER TABLE "new_MealEntry" RENAME TO "MealEntry";
CREATE INDEX "MealEntry_userId_date_idx" ON "MealEntry"("userId", "date");
CREATE INDEX "MealEntry_planItemId_idx" ON "MealEntry"("planItemId");
PRAGMA foreign_keys=ON;

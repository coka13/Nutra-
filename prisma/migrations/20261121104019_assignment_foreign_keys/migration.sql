-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MealPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "assignedClientId" TEXT,
    CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealPlan_assignedClientId_fkey" FOREIGN KEY ("assignedClientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MealPlan" ("assignedClientId", "content", "id", "name", "userId") SELECT "assignedClientId", "content", "id", "name", "userId" FROM "MealPlan";
DROP TABLE "MealPlan";
ALTER TABLE "new_MealPlan" RENAME TO "MealPlan";
CREATE INDEX "MealPlan_assignedClientId_idx" ON "MealPlan"("assignedClientId");
CREATE TABLE "new_Program" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "weeks" INTEGER NOT NULL DEFAULT 4,
    "days" TEXT NOT NULL DEFAULT '1,3,5',
    "assignedClientId" TEXT,
    "template" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Program_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Program_assignedClientId_fkey" FOREIGN KEY ("assignedClientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Program" ("assignedClientId", "createdAt", "days", "description", "id", "name", "ownerId", "template", "weeks") SELECT "assignedClientId", "createdAt", "days", "description", "id", "name", "ownerId", "template", "weeks" FROM "Program";
DROP TABLE "Program";
ALTER TABLE "new_Program" RENAME TO "Program";
CREATE INDEX "Program_ownerId_idx" ON "Program"("ownerId");
CREATE INDEX "Program_assignedClientId_idx" ON "Program"("assignedClientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

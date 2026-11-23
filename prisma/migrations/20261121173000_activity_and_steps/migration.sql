CREATE TABLE "CardioActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "minutes" REAL NOT NULL,
  "distanceKm" REAL,
  "date" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "externalId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardioActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CardioActivity_userId_source_externalId_key" ON "CardioActivity"("userId", "source", "externalId");
CREATE INDEX "CardioActivity_userId_date_idx" ON "CardioActivity"("userId", "date");
CREATE TABLE "DailySteps" (
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "steps" INTEGER NOT NULL,
  "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "date"),
  CONSTRAINT "DailySteps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

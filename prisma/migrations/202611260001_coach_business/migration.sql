CREATE TABLE "CoachPackage" (
 "id" TEXT NOT NULL PRIMARY KEY, "relationshipId" TEXT NOT NULL, "size" INTEGER NOT NULL,
 "price" INTEGER NOT NULL, "date" TEXT NOT NULL, "lowBalanceNotified" BOOLEAN NOT NULL DEFAULT false,
 FOREIGN KEY ("relationshipId") REFERENCES "CoachRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "CoachTraining" (
 "id" TEXT NOT NULL PRIMARY KEY, "packageId" TEXT NOT NULL, "date" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'COMPLETED', "notes" TEXT NOT NULL DEFAULT '',
 FOREIGN KEY ("packageId") REFERENCES "CoachPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "CoachReceipt" (
 "id" TEXT NOT NULL PRIMARY KEY, "packageId" TEXT NOT NULL, "amount" INTEGER NOT NULL,
 "date" TEXT NOT NULL, "method" TEXT NOT NULL, "notes" TEXT NOT NULL DEFAULT '',
 FOREIGN KEY ("packageId") REFERENCES "CoachPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CoachPackage_relationshipId_date_idx" ON "CoachPackage"("relationshipId", "date");
CREATE INDEX "CoachTraining_packageId_date_idx" ON "CoachTraining"("packageId", "date");
CREATE INDEX "CoachReceipt_packageId_date_idx" ON "CoachReceipt"("packageId", "date");

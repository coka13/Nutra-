ALTER TABLE "ProgressPhoto" ADD COLUMN "recordId" TEXT REFERENCES "ProgressRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ProgressPhoto_recordId_idx" ON "ProgressPhoto"("recordId");

-- Optional background image for a coach's brand, shown behind the coach card clients see.
ALTER TABLE "Branding" ADD COLUMN "backgroundAt" DATETIME;
CREATE TABLE "BrandBackground" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "image" BLOB NOT NULL,
    CONSTRAINT "BrandBackground_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

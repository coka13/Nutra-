-- Coach logo shown to linked clients and on invitations. NULL logoAt = no logo.
ALTER TABLE "Branding" ADD COLUMN "logoAt" DATETIME;

CREATE TABLE "BrandLogo" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "image" BLOB NOT NULL,
    CONSTRAINT "BrandLogo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

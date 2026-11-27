-- Records which Terms/Privacy version each user accepted, and explicit health-data consent.
-- Existing users start with neither and are asked once in the app.
ALTER TABLE "User" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "healthConsentAt" DATETIME;

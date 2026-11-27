-- Discount promotions (percent off for a number of months) and their PayPal plans.
ALTER TABLE "Promotion" ADD COLUMN "percentOff" INTEGER;
ALTER TABLE "Promotion" ADD COLUMN "months" INTEGER;
ALTER TABLE "Promotion" ADD COLUMN "paypalPlanPremium" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "paypalPlanCoach" TEXT;
CREATE UNIQUE INDEX "Promotion_paypalPlanPremium_key" ON "Promotion"("paypalPlanPremium");
CREATE UNIQUE INDEX "Promotion_paypalPlanCoach_key" ON "Promotion"("paypalPlanCoach");
ALTER TABLE "Subscription" ADD COLUMN "promotionId" TEXT;

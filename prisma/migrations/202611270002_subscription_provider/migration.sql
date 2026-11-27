-- Payment provider of the subscription: "stripe" or "paypal" (null for free/legacy rows).
ALTER TABLE "Subscription" ADD COLUMN "provider" TEXT;

-- Limits are either NULL ("no limit") or a positive integer. 0 used to mean "unlimited" for a
-- key's daily quota and a negative rate made a provider never send; neither can be stored now.
-- Existing out-of-range values are cleared to "no limit" before the constraints apply.
UPDATE "api_key" SET "dailyQuota" = NULL WHERE "dailyQuota" IS NOT NULL AND "dailyQuota" < 1;
UPDATE "provider" SET "ratePerHour" = NULL WHERE "ratePerHour" IS NOT NULL AND "ratePerHour" < 1;

ALTER TABLE "api_key" ADD CONSTRAINT "api_key_daily_quota_positive" CHECK ("dailyQuota" IS NULL OR "dailyQuota" >= 1);
ALTER TABLE "provider" ADD CONSTRAINT "provider_rate_per_hour_positive" CHECK ("ratePerHour" IS NULL OR "ratePerHour" >= 1);

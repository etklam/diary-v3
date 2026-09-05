CREATE TYPE "public"."price_alert_moving_average_direction" AS ENUM('above', 'below');--> statement-breakpoint
ALTER TABLE "price_alerts" ADD COLUMN "moving_average_direction" "price_alert_moving_average_direction";--> statement-breakpoint
UPDATE "price_alerts" SET "moving_average_direction" = 'above' WHERE "type" = 'MOVING_AVG' AND "moving_average_direction" IS NULL;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_moving_average_period_check" CHECK ("type" <> 'MOVING_AVG' OR "threshold" IN (20, 50, 200));--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_moving_average_direction_check" CHECK (("type" = 'MOVING_AVG' AND "moving_average_direction" IS NOT NULL) OR ("type" <> 'MOVING_AVG' AND "moving_average_direction" IS NULL));

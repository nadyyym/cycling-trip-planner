ALTER TABLE "beton-enrichment_user" DROP CONSTRAINT "beton-enrichment_user_stravaId_unique";--> statement-breakpoint
ALTER TABLE "beton-enrichment_user" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "beton-enrichment_user" DROP COLUMN "stravaId";
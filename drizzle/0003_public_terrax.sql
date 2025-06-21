ALTER TABLE "beton-enrichment_account" RENAME TO "account";--> statement-breakpoint
ALTER TABLE "beton-enrichment_itinerary" RENAME TO "itinerary";--> statement-breakpoint
ALTER TABLE "beton-enrichment_post" RENAME TO "post";--> statement-breakpoint
ALTER TABLE "beton-enrichment_segment" RENAME TO "segment";--> statement-breakpoint
ALTER TABLE "beton-enrichment_session" RENAME TO "session";--> statement-breakpoint
ALTER TABLE "beton-enrichment_user" RENAME TO "user";--> statement-breakpoint
ALTER TABLE "beton-enrichment_verification_token" RENAME TO "verification_token";--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "beton-enrichment_account_userId_beton-enrichment_user_id_fk";
--> statement-breakpoint
ALTER TABLE "itinerary" DROP CONSTRAINT "beton-enrichment_itinerary_userId_beton-enrichment_user_id_fk";
--> statement-breakpoint
ALTER TABLE "post" DROP CONSTRAINT "beton-enrichment_post_createdById_beton-enrichment_user_id_fk";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "beton-enrichment_session_userId_beton-enrichment_user_id_fk";
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "beton-enrichment_account_provider_providerAccountId_pk";--> statement-breakpoint
ALTER TABLE "verification_token" DROP CONSTRAINT "beton-enrichment_verification_token_identifier_token_pk";--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId");--> statement-breakpoint
ALTER TABLE "verification_token" ADD CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary" ADD CONSTRAINT "itinerary_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
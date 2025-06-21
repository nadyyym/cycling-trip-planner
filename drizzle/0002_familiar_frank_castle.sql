CREATE TABLE "beton-enrichment_itinerary" (
	"id" uuid PRIMARY KEY NOT NULL,
	"userId" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"startDate" date NOT NULL,
	"endDate" date NOT NULL,
	"json" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beton-enrichment_segment" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"distance" real NOT NULL,
	"averageGrade" real NOT NULL,
	"polyline" text,
	"latStart" real NOT NULL,
	"lonStart" real NOT NULL,
	"latEnd" real NOT NULL,
	"lonEnd" real NOT NULL,
	"elevHigh" real,
	"elevLow" real,
	"komTime" varchar(50),
	"climbCategory" varchar(10),
	"elevationGain" real,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beton-enrichment_itinerary" ADD CONSTRAINT "beton-enrichment_itinerary_userId_beton-enrichment_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."beton-enrichment_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itinerary_user_id_idx" ON "beton-enrichment_itinerary" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "itinerary_created_at_idx" ON "beton-enrichment_itinerary" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "segment_location_idx" ON "beton-enrichment_segment" USING btree ("latStart","lonStart");--> statement-breakpoint
CREATE INDEX "segment_created_at_idx" ON "beton-enrichment_segment" USING btree ("createdAt");
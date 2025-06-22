CREATE TABLE "trip" (
	"id" uuid PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"creatorUserId" varchar(255),
	"startDate" date NOT NULL,
	"endDate" date NOT NULL,
	"constraints" jsonb NOT NULL,
	"totalDistanceKm" real NOT NULL,
	"totalElevationM" real NOT NULL,
	"days" jsonb NOT NULL,
	"geometryS3Key" text,
	"slug" varchar(255) NOT NULL,
	CONSTRAINT "trip_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_creatorUserId_user_id_fk" FOREIGN KEY ("creatorUserId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_slug_idx" ON "trip" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "trip_creator_idx" ON "trip" USING btree ("creatorUserId");--> statement-breakpoint
CREATE INDEX "trip_created_at_idx" ON "trip" USING btree ("createdAt");
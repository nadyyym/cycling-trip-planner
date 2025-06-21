CREATE TABLE "favourite" (
	"userId" varchar(255) NOT NULL,
	"segmentId" bigint NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "favourite_userId_segmentId_pk" PRIMARY KEY("userId","segmentId")
);
--> statement-breakpoint
ALTER TABLE "favourite" ADD CONSTRAINT "favourite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourite" ADD CONSTRAINT "favourite_segmentId_segment_id_fk" FOREIGN KEY ("segmentId") REFERENCES "public"."segment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favourite_user_idx" ON "favourite" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "favourite_segment_idx" ON "favourite" USING btree ("segmentId");
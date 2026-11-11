-- Destination-only public eCanvas exports. This is additive so an existing
-- destination installation that already has canvas_export keeps its rows.
CREATE TABLE IF NOT EXISTS "canvas_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exporter_id" uuid NOT NULL,
	"canvas_id" text NOT NULL,
	"title" text NOT NULL,
	"html" text NOT NULL,
	"scene" json,
	"metadata" json,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "canvas_export" ADD CONSTRAINT "canvas_export_exporter_id_user_id_fk"
		FOREIGN KEY ("exporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_export_exporter_created_idx"
	ON "canvas_export" USING btree ("exporter_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_export_active_idx"
	ON "canvas_export" USING btree ("id") WHERE "revoked_at" IS NULL;

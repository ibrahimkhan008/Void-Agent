CREATE TABLE "sentinel_monitor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"slug" text NOT NULL,
	"mode" varchar(20) DEFAULT 'monitor' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"interval_seconds" integer DEFAULT 300 NOT NULL,
	"assertions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_status" varchar(12) DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "sentinel_monitor_user_slug_unique" UNIQUE ("user_id", "slug"),
	CONSTRAINT "sentinel_monitor_mode_check" CHECK ("mode" IN ('monitor', 'suggest', 'repair_approval', 'autonomous')),
	CONSTRAINT "sentinel_monitor_last_status_check" CHECK ("last_status" IN ('healthy', 'broken', 'unknown')),
	CONSTRAINT "sentinel_monitor_interval_check" CHECK ("interval_seconds" BETWEEN 60 AND 86400)
);
--> statement-breakpoint
CREATE INDEX "sentinel_monitor_user_idx" ON "sentinel_monitor" ("user_id", "slug");
--> statement-breakpoint
CREATE INDEX "sentinel_monitor_enabled_idx" ON "sentinel_monitor" ("enabled", "last_checked_at");
--> statement-breakpoint
CREATE TABLE "sentinel_incident" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL REFERENCES "sentinel_monitor"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"slug" text NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"failure_signature" text NOT NULL,
	"diagnosis" text,
	"fix_summary" text,
	"fix_html" text,
	"deployed_version" integer,
	"previous_version" integer,
	"verification" jsonb,
	"detected_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "sentinel_incident_status_check" CHECK ("status" IN ('open', 'diagnosed', 'fix_proposed', 'fix_deployed', 'resolved', 'rolled_back', 'closed')),
	CONSTRAINT "sentinel_incident_slug_check" CHECK ("slug" ~ '^[A-Za-z0-9_-]{1,200}$')
);
--> statement-breakpoint
CREATE INDEX "sentinel_incident_user_idx" ON "sentinel_incident" ("user_id", "detected_at");
--> statement-breakpoint
CREATE INDEX "sentinel_incident_open_idx" ON "sentinel_incident" ("monitor_id", "status");

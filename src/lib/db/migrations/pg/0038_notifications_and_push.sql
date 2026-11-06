CREATE TABLE IF NOT EXISTS "notification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" varchar(64) NOT NULL,
  "title" varchar(160) NOT NULL,
  "body" varchar(500) NOT NULL,
  "href" varchar(512),
  "dedupe_key" varchar(160),
  "read_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_created_idx" ON "notification" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_user_unread_idx" ON "notification" ("user_id", "read_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_user_dedupe_idx" ON "notification" ("user_id", "dedupe_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh_encrypted" text NOT NULL,
  "auth_encrypted" text NOT NULL,
  "user_agent" varchar(512),
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscription_user_endpoint_unique" ON "push_subscription" ("user_id", "endpoint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscription_user_idx" ON "push_subscription" ("user_id");

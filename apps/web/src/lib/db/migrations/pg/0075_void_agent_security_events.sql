-- Void-Agent login/signup device and location security activity.
CREATE TABLE IF NOT EXISTS "security_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "event_type" varchar NOT NULL,
  "ip" text NOT NULL,
  "country" text,
  "city" text,
  "device" text NOT NULL,
  "os" text NOT NULL,
  "browser" text NOT NULL,
  "user_agent" text NOT NULL,
  "referer" text,
  "is_new_device" boolean DEFAULT false NOT NULL,
  "is_new_location" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "security_event_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "security_event_user_id_idx"
  ON "security_event" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "security_event_type_idx"
  ON "security_event" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "security_event_created_at_idx"
  ON "security_event" USING btree ("created_at");

CREATE TABLE "user_model_provider" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" varchar(80) NOT NULL,
  "base_url" text NOT NULL,
  "encrypted_api_key" text NOT NULL DEFAULT '',
  "model_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_model_provider_owner_id_unique"
  ON "user_model_provider" ("user_id", "id");
--> statement-breakpoint
CREATE INDEX "user_model_provider_owner_idx"
  ON "user_model_provider" ("user_id", "created_at");

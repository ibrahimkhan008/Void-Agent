ALTER TABLE "chat_thread"
  ADD COLUMN "routing_model_provider" text,
  ADD COLUMN "routing_model" text,
  ADD CONSTRAINT "chat_thread_routing_model_pair_check"
    CHECK (("routing_model_provider" IS NULL) = ("routing_model" IS NULL));
--> statement-breakpoint
CREATE TABLE "team_model_routing_policy" (
  "team_id" uuid PRIMARY KEY NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT false,
  "profiles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_model_routing_profiles_array_check"
    CHECK (jsonb_typeof("profiles") = 'array' AND jsonb_array_length("profiles") <= 40)
);
--> statement-breakpoint
CREATE INDEX "team_model_routing_policy_enabled_idx"
  ON "team_model_routing_policy" ("enabled");
--> statement-breakpoint
CREATE TABLE "team_model_route_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "thread_id" uuid REFERENCES "chat_thread"("id") ON DELETE SET NULL,
  "task_key" text NOT NULL,
  "selected_provider" text NOT NULL,
  "selected_model" text NOT NULL,
  "reason_code" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_model_route_audit_task_check"
    CHECK ("task_key" IN ('general_chat','coding','web_development','web_search','document_extraction','tool_calling','writing','reasoning','vision')),
  CONSTRAINT "team_model_route_audit_reason_check"
    CHECK ("reason_code" IN ('task_ranked','fallback_model_unavailable'))
);
--> statement-breakpoint
CREATE INDEX "team_model_route_audit_team_created_idx"
  ON "team_model_route_audit" ("team_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "team_model_route_audit_thread_idx"
  ON "team_model_route_audit" ("thread_id");

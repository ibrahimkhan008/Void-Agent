CREATE UNIQUE INDEX IF NOT EXISTS "chat_thread_id_user_id_unique"
	ON "chat_thread" ("id", "user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_build" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"thread_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"title" text,
	"summary" text,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"preview_url" text,
	"sandbox_id" text,
	"error" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "app_build_thread_user_owner_fk"
		FOREIGN KEY ("thread_id", "user_id")
		REFERENCES "chat_thread"("id", "user_id") ON DELETE CASCADE,
	CONSTRAINT "app_build_prompt_length_check"
		CHECK (char_length("prompt") BETWEEN 1 AND 4000),
	CONSTRAINT "app_build_status_check"
		CHECK ("status" IN ('queued', 'generating', 'provisioning', 'ready', 'failed', 'cancelled')),
	CONSTRAINT "app_build_title_length_check"
		CHECK ("title" IS NULL OR char_length("title") <= 80),
	CONSTRAINT "app_build_summary_length_check"
		CHECK ("summary" IS NULL OR char_length("summary") <= 500),
	CONSTRAINT "app_build_error_length_check"
		CHECK ("error" IS NULL OR char_length("error") <= 500),
	CONSTRAINT "app_build_preview_url_length_check"
		CHECK ("preview_url" IS NULL OR char_length("preview_url") <= 2048),
	CONSTRAINT "app_build_file_count_check"
		CHECK (jsonb_typeof("files") = 'array' AND jsonb_array_length("files") <= 3)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_build_user_created_idx" ON "app_build" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_build_thread_idx" ON "app_build" ("thread_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_build_sandbox_unique_idx" ON "app_build" ("sandbox_id") WHERE "sandbox_id" IS NOT NULL;

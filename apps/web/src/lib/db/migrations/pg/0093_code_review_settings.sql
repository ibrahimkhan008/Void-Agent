CREATE TABLE "code_review_user_prefs" (
	"user_id" uuid PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
	"review_trigger" varchar(20) DEFAULT 'pr_open' NOT NULL,
	"exhaustive_review" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "code_review_user_prefs_trigger_check" CHECK ("review_trigger" IN ('pr_open', 'every_push', 'smart_detect'))
);
--> statement-breakpoint
CREATE TABLE "code_review_repo_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"repository" text NOT NULL,
	"auto_review" boolean DEFAULT false NOT NULL,
	"review_trigger" varchar(20),
	"exhaustive_review" boolean,
	"review_instructions" text,
	"endpoint_id" uuid,
	"webhook_id" bigint,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "code_review_repo_setting_user_repo_unique" UNIQUE ("user_id", "repository"),
	CONSTRAINT "code_review_repo_setting_repo_check" CHECK ("repository" ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
	CONSTRAINT "code_review_repo_setting_trigger_check" CHECK ("review_trigger" IS NULL OR "review_trigger" IN ('pr_open', 'every_push', 'smart_detect')),
	CONSTRAINT "code_review_repo_setting_instructions_check" CHECK ("review_instructions" IS NULL OR length("review_instructions") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX "code_review_repo_setting_user_idx"
	ON "code_review_repo_setting" ("user_id", "repository");

ALTER TABLE "app_build"
	ADD COLUMN IF NOT EXISTS "build_log" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_build"
	ADD CONSTRAINT "app_build_log_length_check"
	CHECK (char_length("build_log") <= 20000);

-- Void Cyber Self-Learning Playbook File & Free-Form Findings Support
ALTER TABLE "cyber_finding" ALTER COLUMN "session_id" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cyber_learning_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid,
	"filename" varchar(128) DEFAULT 'bugbounty-self-learning.md' NOT NULL,
	"content_markdown" text DEFAULT '' NOT NULL,
	"entries_count" integer DEFAULT 0 NOT NULL,
	"last_learned_summary" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cyber_learning_file" ADD CONSTRAINT "cyber_learning_file_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cyber_learning_file" ADD CONSTRAINT "cyber_learning_file_agent_id_cyber_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."cyber_agent"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_learning_user_file_idx" ON "cyber_learning_file" USING btree ("user_id","filename");

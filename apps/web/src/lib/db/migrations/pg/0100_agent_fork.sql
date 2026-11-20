-- GitHub-style agent forking: provenance link + fork counter.
ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "forked_from_agent_id" uuid;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN IF NOT EXISTS "fork_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent" ADD CONSTRAINT "agent_forked_from_agent_id_agent_id_fk" FOREIGN KEY ("forked_from_agent_id") REFERENCES "public"."agent"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

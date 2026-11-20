CREATE TABLE IF NOT EXISTS "plan_usage" (
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"metric" varchar(40) NOT NULL,
	"period_key" varchar(10) NOT NULL,
	"used" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "plan_usage_user_metric_period_pk" PRIMARY KEY ("user_id", "metric", "period_key"),
	CONSTRAINT "plan_usage_metric_check" CHECK ("metric" IN ('agent_launches', 'scheduled_runs', 'agent_tokens'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_usage_user_metric_idx" ON "plan_usage" ("user_id", "metric", "period_key");

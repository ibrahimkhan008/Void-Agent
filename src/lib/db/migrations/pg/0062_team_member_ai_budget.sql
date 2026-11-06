-- Reference-compatible monthly member cost caps for team workspaces. Prices
-- are expressed in EUR micros; model rates are explicit admin configuration.
CREATE TABLE IF NOT EXISTS "team_member_ai_policy" (
  "member_id" uuid PRIMARY KEY NOT NULL REFERENCES "team_member"("id") ON DELETE CASCADE,
  "monthly_cap_micros" bigint,
  "currency" varchar(3) NOT NULL DEFAULT 'EUR',
  "hard_stop" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_member_ai_policy_cap_nonnegative_check"
    CHECK ("monthly_cap_micros" IS NULL OR "monthly_cap_micros" >= 0),
  CONSTRAINT "team_member_ai_policy_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint

-- Existing non-owner seats receive the upstream €15 monthly hard cap. Owners
-- and personal workspaces remain uncapped; personal teams contain only owners.
INSERT INTO "team_member_ai_policy" ("member_id", "monthly_cap_micros", "currency", "hard_stop")
SELECT tm."id", CASE WHEN tm."role" = 'owner' THEN NULL ELSE 15000000 END,
       'EUR', tm."role" <> 'owner'
FROM "team_member" tm
ON CONFLICT ("member_id") DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_member_ai_usage_period" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "member_id" uuid NOT NULL REFERENCES "team_member"("id") ON DELETE CASCADE,
  "period_start" timestamp NOT NULL,
  "period_end" timestamp NOT NULL,
  "finalized_micros" bigint NOT NULL DEFAULT 0,
  "reserved_micros" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_member_ai_usage_period_counters_nonnegative_check"
    CHECK ("finalized_micros" >= 0 AND "reserved_micros" >= 0),
  CONSTRAINT "team_member_ai_usage_period_member_start_unique"
    UNIQUE ("member_id", "period_start")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "team_member_ai_usage_period_member_idx"
  ON "team_member_ai_usage_period" ("member_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "team_member_ai_reservation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "usage_period_id" uuid NOT NULL REFERENCES "team_member_ai_usage_period"("id") ON DELETE CASCADE,
  "team_id" uuid NOT NULL REFERENCES "team"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "model_key" text NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "estimate_micros" bigint NOT NULL,
  "actual_micros" bigint,
  "status" varchar(16) NOT NULL DEFAULT 'reserved',
  "expires_at" timestamp NOT NULL,
  "finalized_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_member_ai_reservation_estimate_nonnegative_check"
    CHECK ("estimate_micros" >= 0),
  CONSTRAINT "team_member_ai_reservation_actual_nonnegative_check"
    CHECK ("actual_micros" IS NULL OR "actual_micros" >= 0),
  CONSTRAINT "team_member_ai_reservation_status_check"
    CHECK ("status" IN ('reserved', 'finalized', 'released', 'expired'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "team_member_ai_reservation_period_idx"
  ON "team_member_ai_reservation" ("usage_period_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "team_member_ai_reservation_expiry_idx"
  ON "team_member_ai_reservation" ("status", "expires_at");

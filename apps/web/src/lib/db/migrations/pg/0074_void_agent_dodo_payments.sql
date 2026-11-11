-- Optional Dodo paid-plan checkout and event ledger. This does not replace
-- or alter Autumn's organization-scoped usage billing.
CREATE TABLE IF NOT EXISTS "dodo_subscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "dodo_subscription_id" text NOT NULL UNIQUE,
  "dodo_customer_id" text,
  "dodo_product_id" text NOT NULL,
  "tier" varchar(64) DEFAULT 'free' NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "previous_billing_date" timestamp,
  "next_billing_date" timestamp,
  "cancel_at_next_billing_date" boolean DEFAULT false NOT NULL,
  "cancelled_at" timestamp,
  "metadata" jsonb,
  "last_event_at" timestamp DEFAULT 'epoch'::timestamp NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "dodo_subscription_status_check"
    CHECK ("status" IN ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired'))
);
CREATE INDEX IF NOT EXISTS "dodo_subscription_user_id_idx" ON "dodo_subscription" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "dodo_subscription_status_idx" ON "dodo_subscription" USING btree ("status");

CREATE TABLE IF NOT EXISTS "dodo_payment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "dodo_payment_id" text NOT NULL UNIQUE,
  "dodo_subscription_id" text,
  "amount" bigint NOT NULL,
  "currency" varchar(8) NOT NULL,
  "status" varchar(32) NOT NULL,
  "tier" varchar(64) NOT NULL,
  "paid_at" timestamp,
  "metadata" jsonb,
  "last_event_at" timestamp DEFAULT 'epoch'::timestamp NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "dodo_payment_user_id_idx" ON "dodo_payment" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "dodo_payment_subscription_id_idx" ON "dodo_payment" USING btree ("dodo_subscription_id");

CREATE TABLE IF NOT EXISTS "dodo_webhook_event" (
  "webhook_id" text PRIMARY KEY NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "received_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "processed_at" timestamp,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "claim_token" uuid,
  "claim_expires_at" timestamp,
  CONSTRAINT "dodo_webhook_event_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX IF NOT EXISTS "dodo_webhook_event_claim_idx"
  ON "dodo_webhook_event" USING btree ("processed_at", "claim_expires_at", "received_at");

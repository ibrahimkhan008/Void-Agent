CREATE TABLE IF NOT EXISTS "team_invitation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "inviter_id" uuid,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "accepted_by_user_id" uuid,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "team_invitation_role_check" CHECK ("role" IN ('member', 'viewer')),
  CONSTRAINT "team_invitation_status_check" CHECK ("status" IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT "team_invitation_email_canonical_check" CHECK ("email" = lower(btrim("email"))),
  CONSTRAINT "team_invitation_token_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "team_invitation_team_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE CASCADE,
  CONSTRAINT "team_invitation_inviter_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE SET NULL,
  CONSTRAINT "team_invitation_accepted_by_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitation_pending_team_email_unique"
  ON "team_invitation" USING btree ("team_id", "email") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitation_team_status_idx"
  ON "team_invitation" USING btree ("team_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitation_email_idx"
  ON "team_invitation" USING btree ("email");

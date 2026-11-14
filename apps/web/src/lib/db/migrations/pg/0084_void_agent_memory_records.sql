CREATE TABLE "user_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"include_in_context" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_record_user_slug_unique" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "user_record_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" text NOT NULL,
	"change_note" text,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_record_revision_record_rev_unique" UNIQUE("record_id","revision")
);
--> statement-breakpoint
CREATE TABLE "record_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"scope" varchar(16) NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"proposed_content" text NOT NULL,
	"change_note" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"proposed_by" text DEFAULT 'agent' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_record" ADD CONSTRAINT "user_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "user_record_revision" ADD CONSTRAINT "user_record_revision_record_id_user_record_fk" FOREIGN KEY ("record_id") REFERENCES "public"."user_record"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "record_proposal" ADD CONSTRAINT "record_proposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "record_proposal" ADD CONSTRAINT "record_proposal_project_id_project_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "record_proposal" ADD CONSTRAINT "record_proposal_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "project_brain_page" ADD COLUMN "include_in_context" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX "user_record_user_idx" ON "user_record" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "record_proposal_user_status_idx" ON "record_proposal" USING btree ("user_id","status");

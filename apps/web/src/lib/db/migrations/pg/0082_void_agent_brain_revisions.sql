CREATE TABLE "project_brain_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"content" text NOT NULL,
	"change_note" text,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_brain_revision_page_rev_unique" UNIQUE("page_id","revision")
);
--> statement-breakpoint
ALTER TABLE "project_brain_revision" ADD CONSTRAINT "project_brain_revision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "project_brain_revision" ADD CONSTRAINT "project_brain_revision_page_id_project_brain_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."project_brain_page"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "project_brain_revision" ADD CONSTRAINT "project_brain_revision_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "project_brain_revision_page_idx" ON "project_brain_revision" USING btree ("page_id","revision");

CREATE TABLE "canvas_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "canvas_comment_body_length_check" CHECK (length(trim("body")) BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE INDEX "canvas_comment_owner_element_created_idx"
	ON "canvas_comment" ("user_id", "canvas_id", "element_id", "created_at");

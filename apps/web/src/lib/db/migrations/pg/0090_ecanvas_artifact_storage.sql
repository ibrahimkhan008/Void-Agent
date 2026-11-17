CREATE TABLE "ecanvas_artifact" (
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"canvas_id" uuid NOT NULL,
	"html" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "ecanvas_artifact_html_bytes_check" CHECK (octet_length("html") <= 524288)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ecanvas_artifact_owner_canvas_idx"
	ON "ecanvas_artifact" ("user_id", "canvas_id");

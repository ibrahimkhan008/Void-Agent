ALTER TABLE "project_brain_dream_run"
  DROP CONSTRAINT IF EXISTS "project_brain_dream_stage_check";
--> statement-breakpoint
ALTER TABLE "project_brain_dream_run"
  ADD CONSTRAINT "project_brain_dream_stage_check"
  CHECK ("stage" IN ('dedupe', 'contradictions', 'salience', 'archive', 'status', 'done'));

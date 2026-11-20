-- Per-schedule pinned execution model ("provider/model"); NULL = Automatic.
ALTER TABLE "scheduled_task" ADD COLUMN IF NOT EXISTS "model" varchar(120);

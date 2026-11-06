ALTER TABLE "project_brain_page"
  ADD COLUMN IF NOT EXISTS "salience" real NOT NULL DEFAULT 0;

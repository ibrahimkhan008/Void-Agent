-- Void Deploy depth (master prompt §3.9): attribution badges with visibility
-- controls. Deployment history needs NO schema — every publish already
-- inserts a versioned row (slug + version unique); the dashboard now
-- surfaces all versions per slug. The badge toggle is per published page
-- row; a republish INHERITS the previous version's setting so the badge
-- does not silently reappear.

ALTER TABLE "published_page" ADD COLUMN "badge_visible" boolean DEFAULT true NOT NULL;

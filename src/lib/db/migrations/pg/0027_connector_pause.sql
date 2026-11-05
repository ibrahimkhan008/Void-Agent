-- Migration: add is_paused column to user_connector
-- Allows pausing a connector without losing tokens or fully disconnecting.
-- Pause preserves isConnected=true so resume restores without re-OAuth.

-- Earlier connector migrations store provider as varchar, but migrations below
-- extend this enum. Ensure it exists when initializing a fresh database.
DO $$ BEGIN
  CREATE TYPE connector_provider AS ENUM (
    'gmail', 'google-drive', 'google-calendar', 'google-docs', 'google-forms',
    'google-keep', 'google-meet', 'google-sheets', 'google-slides',
    'google-tasks', 'youtube', 'outlook', 'slack', 'notion', 'github',
    'confluence', 'jira', 'linear', 'asana', 'clickup', 'productboard',
    'testrail', 'coda', 'outline', 'slab', 'guru', 'highspot', 'document360',
    'gitlab', 'bitbucket', 'dropbox', 'zendesk', 'freshdesk', 'salesforce',
    'hubspot', 'airtable', 'gong', 'egnyte', 'teams', 'discord', 'bookstack',
    'gitbook', 'canvas', 'loopio', 'discourse', 'xenforo', 'drupal-wiki',
    'axero', 'zulip', 'mediawiki', 'fireflies', 'wikipedia'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

BEGIN;

DO $$
BEGIN
  ALTER TYPE connector_provider ADD VALUE IF NOT EXISTS 'google-calendar';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE user_connector
ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_connector.is_paused IS
  'When true, connector is paused (tokens retained, not usable). Resume re-enables without re-OAuth.';

COMMIT;

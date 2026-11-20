"use client";

import { appStore } from "@/app/store";
import { authClient } from "auth/client";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { useShallow } from "zustand/shallow";

/**
 * The create endpoint requires a slug (min 1 char, unique) and Better Auth
 * does not generate one, so an empty slug field derives it from the name.
 */
function deriveSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The "Create Organization" dialog.
 *
 * Runs on the Better Auth organization plugin, which the server already
 * configures for self-service creation (`allowUserToCreateOrganization`,
 * limit 10 per user). After creating, the flow switches the session into
 * the new organization (the same call the workspace switcher makes) and
 * ends on the organization settings page: its header confirms the new org,
 * every org-scoped cache (agents, workflows, MCP lists) reloads under it,
 * and the invite form for the natural next step is already on screen. No
 * success toast — landing on the new org's settings is the confirmation
 * (the problem-report dialog established the no-success-toast convention).
 */
export function CreateOrganizationDialog() {
  const [open, appStoreMutate] = appStore(
    useShallow((state) => [state.openCreateOrganization, state.mutate]),
  );
  const t = useTranslations("Organization.create");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Closing resets: a fresh open starts a fresh organization form. A failed
  // submit deliberately keeps the fields (see submit) — a taken slug or the
  // per-user org limit is fixed with one edit, not a full retype.
  function closeDialog() {
    appStoreMutate({ openCreateOrganization: false });
    setName("");
    setSlug("");
    setSubmitting(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;
    const typedSlug = slug.trim().toLowerCase();
    // A symbol-only name slugifies to nothing; the raw name still passes the
    // endpoint's min-1 validation, and the user can always type a slug.
    const resolvedSlug = typedSlug || deriveSlug(trimmedName) || trimmedName;
    setSubmitting(true);
    try {
      const { data: created, error } = await authClient.organization.create({
        name: trimmedName,
        slug: resolvedSlug,
      });
      if (error) throw new Error(error.message || t("failed"));
      if (!created) throw new Error(t("failed"));
      appStoreMutate({ openCreateOrganization: false });
      // The create endpoint activates the new organization server-side only;
      // this session keeps resolving the previous workspace until it is
      // switched explicitly — the same call the workspace switcher makes.
      const { error: switchError } = await authClient.organization.setActive({
        organizationId: created.id,
      });
      if (switchError) {
        // The org exists; do not navigate into it on a stale session — the
        // settings header would show the old workspace.
        toast.error(t("createdButSwitchFailed"));
        setSubmitting(false);
        return;
      }
      window.location.assign("/organization/settings");
    } catch (error) {
      setSubmitting(false);
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <DialogContent
        data-testid="create-organization-dialog"
        className="md:max-w-md"
      >
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-5 text-muted-foreground" />
          </div>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="create-organization-name">{t("nameLabel")}</Label>
            <Input
              id="create-organization-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-organization-slug">{t("slugLabel")}</Label>
            <Input
              id="create-organization-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder={t("slugPlaceholder")}
              aria-describedby="create-organization-slug-hint"
            />
            <p
              id="create-organization-slug-hint"
              className="text-xs text-muted-foreground"
            >
              {t("slugHint")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              data-testid="create-organization-submit"
            >
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

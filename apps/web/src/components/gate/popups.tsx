"use client";

import { CreateOrganizationDialog } from "@/components/organization/create-organization-dialog";

import { UpdatesNotice } from "./updates";

/**
 * The gate module's always-mounted popup surface.
 *
 * Creating a team organization runs on the Better Auth organization plugin
 * in every edition; billing popups belong to the hosted product. What stays
 * mounted here is the "Create Organization" dialog and the update notice.
 */
export function GatePopups() {
  return (
    <>
      <CreateOrganizationDialog />
      <UpdatesNotice />
    </>
  );
}

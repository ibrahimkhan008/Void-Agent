/**
 * Community build: there is no admin center. A self-hosted instance belongs
 * to its owner, and user management is part of the hosted team workspaces.
 */
"use client";

import { CreditCard, Settings2, Shield, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "ui/sidebar";

export const AppSidebarAdmin = () => (
  <SidebarMenu>
    <SidebarMenuItem>
      <Link href="/admin/settings/general">
        <SidebarMenuButton className="font-semibold">
          <SlidersHorizontal className="size-4" />
          General settings
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
    <SidebarMenuItem>
      <Link href="/admin/providers">
        <SidebarMenuButton className="font-semibold">
          <Settings2 className="size-4" />
          Model providers
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
    <SidebarMenuItem>
      <Link href="/admin/security">
        <SidebarMenuButton className="font-semibold">
          <Shield className="size-4" />
          Security settings
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
    <SidebarMenuItem>
      <Link href="/admin/payments">
        <SidebarMenuButton className="font-semibold">
          <CreditCard className="size-4" />
          Payment settings
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
  </SidebarMenu>
);

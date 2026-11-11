"use client";

import { useArchives } from "@/hooks/queries/use-archives";
import { Archive, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSidebar } from "ui/sidebar";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "ui/sidebar";

export function AppSidebarArchives() {
  const { data } = useArchives();
  const { setOpenMobile } = useSidebar();
  const archives = data?.archives ?? [];

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Archives</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {archives.slice(0, 5).map((archive) => (
            <SidebarMenuItem key={archive.id}>
              <Link
                href={`/archives/${archive.id}`}
                onClick={() => setOpenMobile(false)}
              >
                <SidebarMenuButton>
                  <Archive className="size-4" />
                  <span className="truncate">{archive.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {archive.itemCount}
                  </span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <Link href="/archives" onClick={() => setOpenMobile(false)}>
              <SidebarMenuButton>
                <ChevronRight className="size-4" />
                <span>
                  {archives.length > 5 ? "All archives" : "Manage archives"}
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

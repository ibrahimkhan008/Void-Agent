"use client";
import { getMarketingUrl } from "lib/marketing-url";
import { BookOpen, CreditCard, Globe, LifeBuoy } from "lucide-react";
import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "ui/sidebar";

const RESOURCES = [
  { label: "Website", href: "/", icon: Globe },
  { label: "Pricing", href: "/pricing", icon: CreditCard },
  { label: "Documentation", href: "/docs", icon: BookOpen },
  { label: "Contact", href: "/contact", icon: LifeBuoy },
] as const;

/**
 * Cross-domain links to the public marketing site (apps/marketing, served at
 * voidagent.space). Absolute URLs through getMarketingUrl — the two frontends
 * deploy independently, so the dashboard must never link these relatively.
 * Open in a new tab: they are a different application.
 */
export function AppSidebarResources() {
  const { setOpenMobile } = useSidebar();
  const base = getMarketingUrl();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Resources</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {RESOURCES.map(({ label, href, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <Link
                href={`${base}${href}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenMobile(false)}
              >
                <SidebarMenuButton className="hover:bg-black/[0.05]">
                  <Icon className="size-4" />
                  <span>{label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

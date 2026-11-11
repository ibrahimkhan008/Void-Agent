import {
  BotIcon,
  BoxIcon,
  CreditCardIcon,
  Settings2Icon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { unauthorized } from "next/navigation";
import { requireAdminPermission } from "auth/permissions";

// Force dynamic rendering to avoid static generation issues with session
export const dynamic = "force-dynamic";

// Staging port note (WP6c): staging has no admin sidebar, so this index page
// is the navigation hub for the admin console, matching the destination
// dashboard's Quick Links section (the /api/admin/dashboard/stats backend it
// also surfaced does not exist in staging).
const SECTIONS = [
  {
    href: "/admin/users",
    icon: UsersIcon,
    label: "User Management",
    desc: "Manage users, roles, and sessions",
  },
  {
    href: "/admin/settings/models",
    icon: BotIcon,
    label: "Models",
    desc: "Provider config, custom providers, fallbacks",
  },
  {
    href: "/admin/settings/tools",
    icon: WrenchIcon,
    label: "Tools",
    desc: "Tool categories, API keys, custom tools",
  },
  {
    href: "/admin/settings/canvas",
    icon: BoxIcon,
    label: "Canvas",
    desc: "Presentation config",
  },
  {
    href: "/admin/settings/artifacts",
    icon: SparklesIcon,
    label: "Artifacts",
    desc: "Artifact config",
  },
  {
    href: "/admin/settings/general",
    icon: Settings2Icon,
    label: "General",
    desc: "Branding, feature flags, rate limits",
  },
  {
    href: "/admin/settings/security",
    icon: ShieldIcon,
    label: "Security",
    desc: "Sessions, header priority, security headers",
  },
  {
    href: "/admin/settings/payments",
    icon: CreditCardIcon,
    label: "Payments",
    desc: "Dodo Payments configuration",
  },
];

export default async function AdminIndexPage() {
  try {
    await requireAdminPermission();
  } catch (_error) {
    unauthorized();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Settings2Icon className="size-6 text-muted-foreground" />
          Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Site configuration and management.
        </p>
      </div>

      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Settings2Icon className="size-4 text-muted-foreground" />
          Sections
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <section.icon className="size-5 text-muted-foreground shrink-0" />
              <div>
                <span className="text-sm font-medium block">
                  {section.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {section.desc}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";

/** Keep old bookmarks working while retiring the heavy Cockpit dashboard. */
export default function CockpitPage() {
  redirect("/");
}

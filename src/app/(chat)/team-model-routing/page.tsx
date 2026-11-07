import { TeamModelRoutingSettings } from "@/components/team-model-routing-settings";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Team model routing — Void-Agent",
  description: "Configure team model allowlists and automatic task routing.",
};

export default function TeamModelRoutingPage() {
  return <TeamModelRoutingSettings />;
}

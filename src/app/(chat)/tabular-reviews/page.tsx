import TabularReviewsDashboard from "@/components/tabular-reviews-dashboard";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return <TabularReviewsDashboard />;
}

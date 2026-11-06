import TabularReviewDetail from "@/components/tabular-review-detail";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return <TabularReviewDetail id={id} />;
}

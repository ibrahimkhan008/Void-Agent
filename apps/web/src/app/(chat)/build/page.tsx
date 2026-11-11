import { BuildDashboard } from "@/components/build/build-dashboard";

export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { threadId } = await searchParams;
  return <BuildDashboard initialThreadId={threadId} />;
}

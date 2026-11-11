import { ArchiveDetail } from "@/components/archives/archive-detail";
import {
  getOwnedArchive,
  listOwnedArchiveThreads,
} from "@/lib/archives/archive-service";
import { getSession } from "@/lib/auth/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/sign-in");
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      id,
    )
  )
    notFound();

  const archive = await getOwnedArchive(id, session.user.id);
  if (!archive) notFound();
  const threads = await listOwnedArchiveThreads(id, session.user.id);
  return <ArchiveDetail archive={archive} threads={threads ?? []} />;
}

import { App as ECanvasApp } from "@/components/canvas/ecanvas/App";
import { getSession } from "auth/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const CANVAS_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function ECanvasByIdPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  if (!CANVAS_ID_PATTERN.test(canvasId)) notFound();
  const session = await getSession();
  if (!session?.user?.id) {
    redirect(`/sign-in?next=${encodeURIComponent(`/ecanvas/${canvasId}`)}`);
  }
  return <ECanvasApp canvasId={canvasId} />;
}

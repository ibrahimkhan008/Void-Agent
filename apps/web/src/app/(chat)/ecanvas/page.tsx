import { randomUUID } from "node:crypto";
import { getSession } from "auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ECanvasPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/sign-in?next=%2Fecanvas");
  redirect(`/ecanvas/${randomUUID()}`);
}

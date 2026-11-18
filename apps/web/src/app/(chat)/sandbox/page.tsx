import { DevicesPanel } from "@/components/devices/devices-panel";
import { getSession } from "auth/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sandbox" };

export default async function DevicesRoute() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <DevicesPanel />
    </div>
  );
}

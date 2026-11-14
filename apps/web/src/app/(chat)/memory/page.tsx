import { MemoryManager } from "@/components/memory/memory-manager";
import { getSession } from "auth/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Void Memory",
};

/**
 * Void Memory (master prompt §3.3): the user's global record set —
 * MEMORY.md, PERSONA.md, BEHAVIOR.md, SKILLS.md, PREFERENCES.md — versioned,
 * retrieval-tuned, with the approval queue for agent-proposed changes.
 */
export default async function MemoryPage() {
  const session = await getSession().catch(() => null);
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <div className="flex min-h-screen flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Memory
          </p>
          <h1 className="text-3xl font-normal tracking-[-0.03em]">
            Void Memory
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            What the agents know about you — persona, behavior, skills,
            preferences, and core memory — kept as versioned records you
            control. The agent proposes changes; nothing sticks without your
            approval.
          </p>
        </div>
      </header>
      <MemoryManager />
    </div>
  );
}

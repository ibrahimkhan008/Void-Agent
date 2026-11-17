import { and, eq } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { EcanvasArtifactTable } from "lib/db/pg/schema.pg";

export async function getEcanvasArtifact(input: {
  userId: string;
  canvasId: string;
}) {
  const [artifact] = await pgDb
    .select({ html: EcanvasArtifactTable.html })
    .from(EcanvasArtifactTable)
    .where(
      and(
        eq(EcanvasArtifactTable.userId, input.userId),
        eq(EcanvasArtifactTable.canvasId, input.canvasId),
      ),
    )
    .limit(1);
  return artifact?.html ?? null;
}

export async function upsertEcanvasArtifact(input: {
  userId: string;
  canvasId: string;
  html: string;
}) {
  const [artifact] = await pgDb
    .insert(EcanvasArtifactTable)
    .values(input)
    .onConflictDoUpdate({
      target: [EcanvasArtifactTable.userId, EcanvasArtifactTable.canvasId],
      set: { html: input.html, updatedAt: new Date() },
    })
    .returning({ updatedAt: EcanvasArtifactTable.updatedAt });
  if (!artifact) throw new Error("eCanvas artifact was not saved");
  return artifact;
}

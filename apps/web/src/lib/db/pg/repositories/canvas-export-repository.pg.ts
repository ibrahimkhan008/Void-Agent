import type {
  CanvasExportPublic,
  CanvasExportRepository,
} from "app-types/canvas-export";
import { and, desc, eq, isNull } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import { CanvasExportTable, UserTable } from "lib/db/pg/schema.pg";

export const pgCanvasExportRepository: CanvasExportRepository = {
  async insert(data) {
    const [row] = await pgDb
      .insert(CanvasExportTable)
      .values({
        exporterId: data.exporterId,
        canvasId: data.canvasId,
        title: data.title,
        html: data.html,
        scene: data.scene,
        metadata: data.metadata,
      })
      .returning({ id: CanvasExportTable.id });
    if (!row) throw new Error("Canvas export was not created");
    return row.id;
  },

  async selectByIdPublic(id) {
    const [row] = await pgDb
      .select({
        id: CanvasExportTable.id,
        title: CanvasExportTable.title,
        html: CanvasExportTable.html,
        canvasId: CanvasExportTable.canvasId,
        createdAt: CanvasExportTable.createdAt,
        metadata: CanvasExportTable.metadata,
        exporterName: UserTable.name,
        exporterImage: UserTable.image,
      })
      .from(CanvasExportTable)
      .leftJoin(UserTable, eq(CanvasExportTable.exporterId, UserTable.id))
      .where(
        and(eq(CanvasExportTable.id, id), isNull(CanvasExportTable.revokedAt)),
      );
    return (row as CanvasExportPublic | undefined) ?? null;
  },

  async selectSummaryByExporterId(exporterId) {
    const rows = await pgDb
      .select({
        id: CanvasExportTable.id,
        title: CanvasExportTable.title,
        canvasId: CanvasExportTable.canvasId,
        createdAt: CanvasExportTable.createdAt,
        revokedAt: CanvasExportTable.revokedAt,
      })
      .from(CanvasExportTable)
      .where(eq(CanvasExportTable.exporterId, exporterId))
      .orderBy(desc(CanvasExportTable.createdAt));
    return rows.map((row) => ({
      ...row,
      revokedAt: row.revokedAt ?? undefined,
    }));
  },

  async selectByIdForZip(id) {
    const [row] = await pgDb
      .select()
      .from(CanvasExportTable)
      .where(
        and(eq(CanvasExportTable.id, id), isNull(CanvasExportTable.revokedAt)),
      );
    return row ?? null;
  },

  async revokeById(id, exporterId) {
    const rows = await pgDb
      .update(CanvasExportTable)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(CanvasExportTable.id, id),
          eq(CanvasExportTable.exporterId, exporterId),
          isNull(CanvasExportTable.revokedAt),
        ),
      )
      .returning({ id: CanvasExportTable.id });
    return rows.length > 0;
  },
};

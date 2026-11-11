import { CanvasExportIdSchema } from "app-types/canvas-export";
import { pgCanvasExportRepository } from "lib/db/pg/repositories/canvas-export-repository.pg";
import { buildSandboxedCanvasHtml } from "lib/ecanvas/export-safety";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CanvasExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!CanvasExportIdSchema.safeParse(id).success) notFound();
  const exported = await pgCanvasExportRepository.selectByIdPublic(id);
  if (!exported) notFound();

  return (
    <main className="flex min-h-screen w-full flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold md:text-lg">
            {exported.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            Shared Void-Agent canvas
            {exported.exporterName ? ` · by ${exported.exporterName}` : ""}
          </p>
        </div>
        <a
          href={`/api/ecanvas/export/${exported.id}/zip`}
          className="shrink-0 text-xs underline underline-offset-4 md:text-sm"
        >
          Download ZIP
        </a>
      </header>
      <section className="flex-1 p-3 md:p-5">
        <iframe
          title={exported.title}
          srcDoc={buildSandboxedCanvasHtml(exported.html)}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="h-[calc(100vh-6.5rem)] w-full rounded-md border border-border bg-white"
        />
      </section>
    </main>
  );
}

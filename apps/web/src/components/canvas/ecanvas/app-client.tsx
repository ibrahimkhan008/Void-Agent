"use client";

import dynamic from "next/dynamic";

/**
 * Client-only loader for the eCanvas editor. Excalidraw touches `window` at
 * module-evaluation time, so a static import crashes the server render of
 * /ecanvas/[canvasId] (caught live: the route 500ed for every visit). The
 * whole editor must mount browser-side only.
 */
const ECanvasApp = dynamic(() => import("./App").then((mod) => mod.App), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
      Loading canvas…
    </div>
  ),
});

export default ECanvasApp;

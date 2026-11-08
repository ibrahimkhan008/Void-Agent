"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";

const MAX_EDGE = 1536;

export function ImageMaskEditor({
  open,
  imageUrl,
  imageName,
  applying = false,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  imageUrl: string;
  imageName: string;
  applying?: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (mask: File) => void | Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [hasPaint, setHasPaint] = useState(false);
  const [brush, setBrush] = useState(36);

  const reset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        1,
        MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      setHasPaint(false);
      setReady(true);
    };
    image.onerror = () => setReady(false);
    image.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y:
        ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || applying) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { x, y } = point(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.fillStyle = "rgba(255,255,255,0.7)";
    context.beginPath();
    context.arc(x, y, brush / 2, 0, Math.PI * 2);
    context.fill();
    setHasPaint(true);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const { x, y } = point(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.strokeStyle = "rgba(255,255,255,0.7)";
    context.lineWidth = brush;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  };

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    const context = event.currentTarget.getContext("2d");
    context?.beginPath();
  };

  const apply = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasPaint) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    await onApply(
      new File([blob], `${imageName}-mask.png`, { type: "image/png" }),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Paint the area to change</DialogTitle>
          <DialogDescription>
            Brush over the part of the image the AI should replace. The painted
            area is regenerated; the rest of the image is preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <label htmlFor="image-mask-brush" className="text-sm">
            Brush size
          </label>
          <input
            id="image-mask-brush"
            aria-label="Brush size"
            type="range"
            min={8}
            max={120}
            value={brush}
            onChange={(event) => setBrush(Number(event.target.value))}
          />
          <Button type="button" variant="secondary" onClick={reset}>
            Clear mask
          </Button>
        </div>
        <div className="relative mx-auto max-h-[60vh] max-w-full overflow-hidden">
          {/* The source stays outside the canvas so cross-origin uploads never taint the mask. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={imageName}
            className="block max-h-[60vh] max-w-full object-contain"
          />
          <canvas
            ref={canvasRef}
            aria-label="Paint the image area to regenerate"
            className="absolute inset-0 h-full w-full touch-none cursor-crosshair opacity-70"
            style={{ visibility: ready ? "visible" : "hidden" }}
            onPointerDown={start}
            onPointerMove={draw}
            onPointerUp={stop}
            onPointerCancel={stop}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!ready || !hasPaint || applying}
            onClick={apply}
          >
            {applying ? "Uploading mask…" : "Use mask"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

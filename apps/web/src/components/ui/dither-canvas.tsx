"use client";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * Dither image + canvas (design-system extension mod): a pixelated raster
 * with a canvas overlay the client repaints as a drifting Bayer-8×8 dither
 * (ink #3C3C3C at 37% coverage, gamma 1.4, 2px dots) under slow drifting
 * mist (0.08 strength, 30 fps cap) with an optional 14% top fade.
 *
 * The animation pauses when the canvas leaves the viewport and when the tab
 * is hidden, and renders static under prefers-reduced-motion. The wrapper
 * fills whatever box its className gives it; width/height are the draw
 * buffer only.
 */
export function DitherCanvas({
  src,
  alt = "",
  className,
  width = 480,
  height = 320,
  topFade = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  topFade?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const bayer8 = [
      [0, 32, 8, 40, 2, 34, 10, 42],
      [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38],
      [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41],
      [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37],
      [63, 31, 55, 23, 61, 29, 53, 21],
    ];

    const INK = [60, 60, 60]; // #3C3C3C
    const COVERAGE = 0.37;
    const GAMMA = 1.4;
    const DOT = 2;
    const MIST_ALPHA = 0.08;
    const FPS_MS = 1000 / 30;
    const TOP_FADE = 0.14;

    // Slow-drifting mist blobs (strength 0.32 of the base alpha, 30 fps cap).
    const blobs = Array.from({ length: 3 }, (_, i) => ({
      rx: 0.42 - i * 0.09,
      ry: 0.3,
      x: 0.2 + i * 0.3,
      y: 0.25 + i * 0.22,
      speed: 0.05 + i * 0.02,
      dir: i % 2 === 0 ? 1 : -1,
    }));

    const draw = (phase: number, t: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, phase % 4, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);
      const data = frame.data;
      const out = ctx.createImageData(w, h);
      const outData = out.data;
      for (let y = 0; y < h; y += DOT) {
        for (let x = 0; x < w; x += DOT) {
          const px = (y * w + x) * 4;
          const lum =
            (0.2126 * data[px] +
              0.7152 * data[px + 1] +
              0.0722 * data[px + 2]) /
            255;
          const threshold =
            bayer8[Math.floor(y / DOT) % 8][Math.floor(x / DOT) % 8] / 64 +
            (phase % 8) * 0.02;
          const inked = Math.pow(lum, GAMMA) < threshold * 0.5 + 0.25;
          const alpha = inked ? Math.round(255 * COVERAGE) : 0;
          for (let dy = 0; dy < DOT && y + dy < h; dy++) {
            for (let dx = 0; dx < DOT && x + dx < w; dx++) {
              const o = ((y + dy) * w + (x + dx)) * 4;
              outData[o] = INK[0];
              outData[o + 1] = INK[1];
              outData[o + 2] = INK[2];
              outData[o + 3] = alpha;
            }
          }
        }
      }
      ctx.putImageData(out, 0, 0);

      // Mist: soft light blobs drifting horizontally over the dither.
      for (const blob of blobs) {
        const cx = ((blob.x + blob.dir * (t / 60000) * blob.speed) % 1.4) * w;
        const cy = blob.y * h;
        const grad = ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          Math.max(w * blob.rx, 40),
        );
        grad.addColorStop(
          0,
          `rgba(236,236,234,${MIST_ALPHA + 0.32 * MIST_ALPHA})`,
        );
        grad.addColorStop(1, "rgba(236,236,234,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Top fade: soften the first 14% into the ground above.
      if (TOP_FADE) {
        const fade = ctx.createLinearGradient(0, 0, 0, h * TOP_FADE);
        fade.addColorStop(0, "rgba(236,236,234,1)");
        fade.addColorStop(1, "rgba(236,236,234,0)");
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, w, h * TOP_FADE);
      }
    };

    let cleanup: (() => void) | undefined;

    const start = () => {
      draw(0, 0);
      if (reduceMotion) return;
      let raf = 0;
      let phase = 0;
      let lastPhase = 0;
      let lastFrame = 0;
      let visible = true;
      const loop = (t: number) => {
        // 30 fps cap for the repaint; the dither phase steps at ~11 fps.
        if (t - lastFrame > FPS_MS) {
          lastFrame = t;
          if (t - lastPhase > 90) {
            phase = (phase + 1) % 8;
            lastPhase = t;
          }
          draw(phase, t);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      // Pause when off screen and when the tab is hidden.
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !visible) {
          visible = true;
          raf = requestAnimationFrame(loop);
        } else if (!entry.isIntersecting && visible) {
          visible = false;
          cancelAnimationFrame(raf);
        }
      });
      io.observe(canvas);
      const onVis = () => {
        if (document.hidden) {
          visible = false;
          cancelAnimationFrame(raf);
        } else if (!visible) {
          visible = true;
          raf = requestAnimationFrame(loop);
        }
      };
      document.addEventListener("visibilitychange", onVis);

      cleanup = () => {
        io.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        cancelAnimationFrame(raf);
      };
    };

    if (img.complete && img.naturalWidth > 0) {
      start();
    } else {
      img.onload = start;
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [reduceMotion, src, topFade]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 h-full w-full transition-opacity duration-700"
      />
    </div>
  );
}

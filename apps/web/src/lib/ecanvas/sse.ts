export function encodeCanvasEvent(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function encodeCanvasDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

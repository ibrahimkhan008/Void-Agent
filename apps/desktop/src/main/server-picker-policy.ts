export function isCompatibleServerHealthResponse(input: {
  status: number;
  contentType: string | null;
  body: string;
}) {
  if (
    (input.status !== 200 && input.status !== 503) ||
    !input.contentType?.toLowerCase().includes("application/json")
  )
    return false;
  if (input.body.length > 8_192) return false;
  try {
    const parsed: unknown = JSON.parse(input.body);
    if (!parsed || typeof parsed !== "object") return false;
    const value = parsed as Record<string, unknown>;
    return (
      value.service === "flare-ai" &&
      ((input.status === 200 && value.status === "ok") ||
        (input.status === 503 && value.status === "degraded"))
    );
  } catch {
    return false;
  }
}

export function isTrustedServerPickerCall(input: {
  hasPicker: boolean;
  pickerDestroyed: boolean;
  senderMatches: boolean;
  mainFrameMatches: boolean;
  frameUrl: string;
}) {
  return (
    input.hasPicker &&
    !input.pickerDestroyed &&
    input.senderMatches &&
    input.mainFrameMatches &&
    input.frameUrl.startsWith("data:text/html;charset=utf-8,")
  );
}

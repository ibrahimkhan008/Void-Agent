export const ASSEMBLYAI_STREAM_URL = "wss://streaming.eu.assemblyai.com/v3/ws";
export const ASSEMBLYAI_SAMPLE_RATE = 16_000;

export function buildAssemblyAIStreamingUrl(token: string) {
  const params = new URLSearchParams({
    speech_model: "universal-3-6-pro",
    sample_rate: String(ASSEMBLYAI_SAMPLE_RATE),
    encoding: "pcm_s16le",
    language_code: "en",
    keyterms_prompt: JSON.stringify([
      "Void-Agent",
      "workflow",
      "agent",
      "project",
    ]),
    min_turn_silence: "100",
    max_turn_silence: "700",
    token,
  });
  return `${ASSEMBLYAI_STREAM_URL}?${params.toString()}`;
}

export function resampleFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate = ASSEMBLYAI_SAMPLE_RATE,
) {
  if (inputRate === targetRate || input.length === 0) return input;
  const ratio = inputRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let outIndex = 0; outIndex < outputLength; outIndex += 1) {
    const start = Math.floor(outIndex * ratio);
    const end = Math.min(Math.floor((outIndex + 1) * ratio), input.length);
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1)
      sum += input[inputIndex]!;
    output[outIndex] = sum / Math.max(1, end - start);
  }
  return output;
}

export function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]!));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

export function readFinalAssemblyAITranscript(
  value: unknown,
): { text: string; turnOrder?: number } | null {
  if (typeof value !== "string" || value.length > 32_000) return null;
  let message: unknown;
  try {
    message = JSON.parse(value);
  } catch {
    return null;
  }
  if (!message || typeof message !== "object") return null;
  const turn = message as {
    type?: unknown;
    transcript?: unknown;
    end_of_turn?: unknown;
    turn_is_formatted?: unknown;
    turn_order?: unknown;
  };
  if (
    turn.type !== "Turn" ||
    turn.end_of_turn !== true ||
    turn.turn_is_formatted === false ||
    typeof turn.transcript !== "string"
  )
    return null;
  const text = turn.transcript.trim().slice(0, 2_000);
  if (!text) return null;
  return {
    text,
    ...(typeof turn.turn_order === "number" && Number.isFinite(turn.turn_order)
      ? { turnOrder: turn.turn_order }
      : {}),
  };
}

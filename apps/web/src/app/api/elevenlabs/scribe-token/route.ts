import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { withAuth } from "auth/route-guard";
import { NextResponse } from "next/server";

/**
 * Mint a single-use ElevenLabs Scribe token for authenticated users.
 *
 * The token expires after 15 minutes and is consumed on connect, so the
 * browser never needs the ELEVENLABS_API_KEY — it stays server-side, same
 * contract as the AssemblyAI temp-token route this replaces in the composer.
 */
export const POST = withAuth(async (_request, _session) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("ELEVENLABS_API_KEY is not configured");
      return NextResponse.json(
        { error: "Voice service not configured" },
        { status: 503 },
      );
    }

    const elevenlabs = new ElevenLabsClient();
    const { token } =
      await elevenlabs.tokens.singleUse.create("realtime_scribe");

    return NextResponse.json({ token });
  } catch (error) {
    console.error("ElevenLabs token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }
});

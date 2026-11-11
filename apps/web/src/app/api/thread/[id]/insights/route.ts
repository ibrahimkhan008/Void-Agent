import { withAuth } from "auth/route-guard";
import { generateThreadInsights } from "lib/ai/thread-insights";
import { pgThreadInsightsRepository } from "lib/db/pg/repositories/thread-insights-repository.pg";
import { checkApiRateLimit } from "lib/rate-limit/api-rate-limit";
import { hasSameOrigin } from "lib/security/same-origin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 45;

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withAuth(
  async (request, session, { params }: RouteContext) => {
    if (!hasSameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: threadId } = await params;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        threadId,
      )
    ) {
      return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
    }

    const limit = await checkApiRateLimit({
      kind: "thread-insights",
      id: `${session.user.id}:${threadId}`,
      limit: 3,
      windowMs: 5 * 60_000,
    }).catch(() => null);
    if (!limit) {
      return NextResponse.json(
        { error: "Insights are temporarily unavailable" },
        { status: 503 },
      );
    }
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Insights generation limit reached" },
        { status: 429 },
      );
    }

    let transcript: Awaited<
      ReturnType<typeof pgThreadInsightsRepository.loadTranscriptForOwner>
    >;
    try {
      transcript = await pgThreadInsightsRepository.loadTranscriptForOwner(
        threadId,
        session.user.id,
      );
    } catch (error) {
      console.error(
        "Thread insights transcript read failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return NextResponse.json(
        { error: "Could not load thread transcript" },
        { status: 500 },
      );
    }
    if (!transcript)
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    let insights: Awaited<ReturnType<typeof generateThreadInsights>>;
    try {
      insights = await generateThreadInsights({
        title: transcript.title,
        messages: transcript.messages,
        totalMessageCount: transcript.messageCount,
        abortSignal: AbortSignal.timeout(35_000),
      });
    } catch (error) {
      console.error(
        "Thread insights generation failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return NextResponse.json(
        { error: "Could not generate valid thread insights" },
        { status: 502 },
      );
    }

    try {
      const saved =
        await pgThreadInsightsRepository.saveForOwnerIfTranscriptCurrent({
          threadId,
          userId: session.user.id,
          expectedLastMessageId: transcript.lastMessageId,
          expectedTranscriptHash: transcript.transcriptHash,
          sourceMessageCount: transcript.messageCount,
          insights,
        });
      if (saved.status === "not_found") {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 },
        );
      }
      if (saved.status === "transcript_changed") {
        return NextResponse.json(
          {
            error: "The conversation changed during generation. Please retry.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          summary: saved.insights.summary,
          decisions: saved.insights.decisions,
          actionItems: saved.insights.actionItems,
          insightsGeneratedAt: saved.insights.generatedAt,
          sourceMessageCount: saved.insights.sourceMessageCount,
          sourceLastMessageId: saved.insights.sourceLastMessageId,
          currentMessageCount: saved.insights.currentMessageCount,
          currentLastMessageId: saved.insights.currentLastMessageId,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      console.error(
        "Thread insights persistence failed",
        error instanceof Error ? error.name : "UnknownError",
      );
      return NextResponse.json(
        { error: "Could not save thread insights" },
        { status: 500 },
      );
    }
  },
);

import { requireCyberAccess } from "lib/cyber/auth";
import { resolveUserCyberQuotas } from "lib/cyber/quotas";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const programId = url.searchParams.get("programId");

  const [sessions, quotas] = await Promise.all([
    programId
      ? cyberRepository.listSessionsByProgram(programId, limit)
      : cyberRepository.listSessionsByUser(access.session.user.id, limit),
    resolveUserCyberQuotas(access.session.user.id, access.profile),
  ]);

  return NextResponse.json({ sessions, quotas });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  // Enforce owner-controlled Max Active Cyber Sessions per user plan / override
  const quotas = await resolveUserCyberQuotas(
    access.session.user.id,
    access.profile,
  );
  if (quotas.activeCyberSessions >= quotas.maxActiveCyberSessions) {
    return NextResponse.json(
      {
        error: `Active Void Cyber session limit reached (${quotas.activeCyberSessions}/${quotas.maxActiveCyberSessions} for ${quotas.planLabel} plan). Complete or pause an active session first, or ask an admin to raise your limit.`,
        code: "CYBER_SESSION_LIMIT_REACHED",
        quotas,
      },
      { status: 429 },
    );
  }

  let body: {
    programId: string;
    title: string;
    sandboxId?: string;
    assignedAgents?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.programId || !body.title?.trim()) {
    return NextResponse.json(
      { error: "programId and title are required" },
      { status: 400 },
    );
  }

  const program = await cyberRepository.getProgramById(body.programId);
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  const scopes = await cyberRepository.listProgramScopes(body.programId);
  if (scopes.length === 0) {
    return NextResponse.json(
      { error: "Cannot start a session — program has no scopes configured" },
      { status: 422 },
    );
  }

  const cyberSession = await cyberRepository.createSession({
    userId: access.session.user.id,
    programId: body.programId,
    title: body.title.trim(),
    sandboxId: body.sandboxId,
    assignedAgents: body.assignedAgents ?? [
      "orchestrator",
      "recon",
      "web",
      "verifier",
    ],
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId: cyberSession.id,
      eventType: "session_created",
      severity: "info",
      details: {
        programId: body.programId,
        title: cyberSession.title,
        activeSessionsAfter: quotas.activeCyberSessions + 1,
        maxActiveSessions: quotas.maxActiveCyberSessions,
      },
    })
    .catch(() => {});

  return NextResponse.json({ session: cyberSession }, { status: 201 });
}

import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const programId = url.searchParams.get("programId");

  const sessions = programId
    ? await cyberRepository.listSessionsByProgram(programId, limit)
    : await cyberRepository.listSessionsByUser(access.session.user.id, limit);

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

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
      details: { programId: body.programId, title: cyberSession.title },
    })
    .catch(() => {});

  return NextResponse.json({ session: cyberSession }, { status: 201 });
}

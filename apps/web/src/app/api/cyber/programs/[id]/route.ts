import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const program = await cyberRepository.getProgramById(id);
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  const [scopes, sessions] = await Promise.all([
    cyberRepository.listProgramScopes(id),
    cyberRepository.listSessionsByProgram(id, 25),
  ]);

  return NextResponse.json({ program, scopes, sessions });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  const { id } = await params;

  let body: Partial<{
    name: string;
    description: string;
    policyMarkdown: string;
    hasBounties: boolean;
    rulesMetadata: Record<string, unknown>;
  }>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updated = await cyberRepository.updateProgram(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "program_updated",
      severity: "info",
      details: { programId: id },
    })
    .catch(() => {});

  return NextResponse.json({ program: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(3);
  if (!access.ok) return access.response;

  const { id } = await params;
  const deleted = await cyberRepository.deleteProgram(id);
  if (!deleted) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "program_deleted",
      severity: "warning",
      details: { programId: id },
    })
    .catch(() => {});

  return NextResponse.json({ success: true });
}

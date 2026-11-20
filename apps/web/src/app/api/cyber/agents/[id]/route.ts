import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const existing = await cyberRepository.getAgentById(id);
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (
    existing.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: Partial<{
    name: string;
    description: string;
    systemPrompt: string;
    skillSlugs: string[];
    sandboxEnabled: boolean;
    isShared: boolean;
  }>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updated = await cyberRepository.updateAgent(id, {
    ...(body.name !== undefined
      ? { name: body.name.trim().slice(0, 128) }
      : {}),
    ...(body.description !== undefined
      ? { description: body.description.trim() }
      : {}),
    ...(body.systemPrompt !== undefined
      ? { systemPrompt: body.systemPrompt.trim() }
      : {}),
    ...(Array.isArray(body.skillSlugs) ? { skillSlugs: body.skillSlugs } : {}),
    ...(typeof body.sandboxEnabled === "boolean"
      ? { sandboxEnabled: body.sandboxEnabled }
      : {}),
    ...(typeof body.isShared === "boolean" && access.profile.accessTier >= 3
      ? { isShared: body.isShared }
      : {}),
  });

  return NextResponse.json({ agent: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const existing = await cyberRepository.getAgentById(id);
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (
    existing.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  await cyberRepository.deleteAgent(id);

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "cyber_agent_deleted",
      severity: "info",
      details: { agentId: id, name: existing.name },
    })
    .catch(() => {});

  return NextResponse.json({ success: true });
}

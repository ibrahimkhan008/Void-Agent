import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET() {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const agents = await cyberRepository.listAgentsForUser(
    access.session.user.id,
  );
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  let body: {
    name?: string;
    description?: string;
    systemPrompt?: string;
    skillSlugs?: string[];
    sandboxEnabled?: boolean;
    isShared?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.systemPrompt?.trim()) {
    return NextResponse.json(
      { error: "name and systemPrompt are required" },
      { status: 400 },
    );
  }

  const skillSlugs = Array.isArray(body.skillSlugs)
    ? body.skillSlugs.filter((s): s is string => typeof s === "string")
    : [];

  const agent = await cyberRepository.createAgent({
    userId: access.session.user.id,
    name: body.name.trim().slice(0, 128),
    description: body.description?.trim() || undefined,
    systemPrompt: body.systemPrompt.trim(),
    skillSlugs,
    sandboxEnabled: body.sandboxEnabled !== false,
    isShared: access.profile.accessTier >= 3 ? Boolean(body.isShared) : false,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "cyber_agent_created",
      severity: "info",
      details: {
        agentId: agent.id,
        name: agent.name,
        skillSlugs,
      },
    })
    .catch(() => {});

  return NextResponse.json({ agent }, { status: 201 });
}

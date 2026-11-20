import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES = ["url", "domain", "wildcard", "cidr", "mobile_app"];

export async function GET(_req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id } = await params;
  const scopes = await cyberRepository.listProgramScopes(id);
  return NextResponse.json({ scopes });
}

export async function POST(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(2);
  if (!access.ok) return access.response;

  const { id: programId } = await params;

  let body: {
    assetIdentifier: string;
    assetType: "url" | "domain" | "wildcard" | "cidr" | "mobile_app";
    isInScope?: boolean;
    maxSeverityAllowed?: string;
    instructionNotes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.assetIdentifier?.trim() || !body.assetType) {
    return NextResponse.json(
      { error: "assetIdentifier and assetType are required" },
      { status: 400 },
    );
  }

  if (!VALID_TYPES.includes(body.assetType)) {
    return NextResponse.json(
      { error: `assetType must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const program = await cyberRepository.getProgramById(programId);
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  const scope = await cyberRepository.addProgramScope({
    programId,
    assetIdentifier: body.assetIdentifier.trim(),
    assetType: body.assetType,
    isInScope: body.isInScope ?? true,
    maxSeverityAllowed: body.maxSeverityAllowed,
    instructionNotes: body.instructionNotes,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "program_scope_added",
      severity: "info",
      details: {
        programId,
        scopeId: scope.id,
        assetIdentifier: scope.assetIdentifier,
        isInScope: scope.isInScope,
      },
    })
    .catch(() => {});

  return NextResponse.json({ scope }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(2);
  if (!access.ok) return access.response;

  const { id: programId } = await params;
  const url = new URL(req.url);
  const scopeId = url.searchParams.get("scopeId");
  if (!scopeId) {
    return NextResponse.json(
      { error: "scopeId query parameter is required" },
      { status: 400 },
    );
  }

  const deleted = await cyberRepository.deleteProgramScope(scopeId);
  if (!deleted) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "program_scope_deleted",
      severity: "info",
      details: { programId, scopeId },
    })
    .catch(() => {});

  return NextResponse.json({ success: true });
}

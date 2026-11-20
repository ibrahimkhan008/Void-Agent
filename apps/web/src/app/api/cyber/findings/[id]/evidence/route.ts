import { createHash } from "node:crypto";
import { requireCyberAccess } from "lib/cyber/auth";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

const VALID_EVIDENCE_TYPES = new Set([
  "http_trace",
  "screenshot",
  "poc_script",
  "terminal_log",
]);

export async function POST(req: NextRequest, { params }: Params) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const { id: findingId } = await params;
  const finding = await cyberRepository.getFindingById(findingId);
  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  if (
    finding.userId !== access.session.user.id &&
    access.profile.accessTier < 3
  ) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let body: {
    evidenceType: string;
    payloadBytes: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.evidenceType || !body.payloadBytes?.trim()) {
    return NextResponse.json(
      { error: "evidenceType and payloadBytes are required" },
      { status: 400 },
    );
  }

  const evidenceType = VALID_EVIDENCE_TYPES.has(body.evidenceType)
    ? body.evidenceType
    : "terminal_log";

  const sha256Hash = createHash("sha256")
    .update(body.payloadBytes, "utf8")
    .digest("hex");

  const evidence = await cyberRepository.addEvidence({
    findingId,
    evidenceType,
    sha256Hash,
    payloadBytes: body.payloadBytes,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      sessionId: finding.sessionId ?? undefined,
      eventType: "evidence_vault_added",
      severity: "info",
      details: {
        findingId,
        evidenceId: evidence.id,
        evidenceType,
        sha256Hash,
      },
    })
    .catch(() => {});

  return NextResponse.json({ evidence }, { status: 201 });
}

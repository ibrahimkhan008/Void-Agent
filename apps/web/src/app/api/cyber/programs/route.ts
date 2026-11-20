import { requireCyberAccess } from "lib/cyber/auth";
import {
  type CyberProgramScope,
  cyberRepository,
} from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

const VALID_ASSET_TYPES = new Set([
  "url",
  "domain",
  "wildcard",
  "cidr",
  "mobile_app",
]);

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const programs = await cyberRepository.listProgramsWithCounts({
    limit,
    offset,
  });
  return NextResponse.json({ programs });
}

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(2);
  if (!access.ok) return access.response;

  let body: {
    name: string;
    programHandle: string;
    description?: string;
    policyMarkdown?: string;
    hasBounties?: boolean;
    currency?: string;
    rulesMetadata?: Record<string, unknown>;
    scopes?: Array<{
      assetIdentifier: string;
      assetType?: string;
      isInScope?: boolean;
      maxSeverityAllowed?: string;
      notes?: string;
      instructionNotes?: string;
    }>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.programHandle?.trim()) {
    return NextResponse.json(
      { error: "name and programHandle are required" },
      { status: 400 },
    );
  }

  const normalizedHandle = body.programHandle.trim().toLowerCase();
  const existing = await cyberRepository.getProgramByHandle(normalizedHandle);
  if (existing) {
    return NextResponse.json(
      { error: `Program handle '@${normalizedHandle}' is already taken` },
      { status: 409 },
    );
  }

  const program = await cyberRepository.createProgram({
    name: body.name.trim(),
    programHandle: normalizedHandle,
    description: body.description,
    policyMarkdown: body.policyMarkdown,
    hasBounties: body.hasBounties ?? false,
    currency: body.currency ?? "USD",
    rulesMetadata: body.rulesMetadata ?? {},
    createdByUserId: access.session.user.id,
  });

  const createdScopes: CyberProgramScope[] = [];
  if (Array.isArray(body.scopes)) {
    for (const scope of body.scopes) {
      if (!scope.assetIdentifier?.trim()) continue;
      const assetType = (
        scope.assetType && VALID_ASSET_TYPES.has(scope.assetType)
          ? scope.assetType
          : "domain"
      ) as "url" | "domain" | "wildcard" | "cidr" | "mobile_app";

      const created = await cyberRepository.addProgramScope({
        programId: program.id,
        assetIdentifier: scope.assetIdentifier.trim(),
        assetType,
        isInScope: scope.isInScope ?? true,
        maxSeverityAllowed: scope.maxSeverityAllowed,
        instructionNotes: scope.instructionNotes ?? scope.notes,
      });
      createdScopes.push(created);
    }
  }

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "program_created",
      severity: "info",
      details: {
        programId: program.id,
        programHandle: normalizedHandle,
        scopeCount: createdScopes.length,
      },
    })
    .catch(() => {});

  return NextResponse.json({ program, scopes: createdScopes }, { status: 201 });
}

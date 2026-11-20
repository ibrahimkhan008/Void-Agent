import { requireCyberAccess } from "lib/cyber/auth";
import {
  type ProgramScopeAsset,
  evaluateTargetScope,
} from "lib/cyber/scope-matcher";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  let body: {
    programId: string;
    targetAsset: string;
    category?: string;
    isIntrusive?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.programId || !body.targetAsset?.trim()) {
    return NextResponse.json(
      { error: "programId and targetAsset are required" },
      { status: 400 },
    );
  }

  const program = await cyberRepository.getProgramById(body.programId);
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  const rawScopes = await cyberRepository.listProgramScopes(body.programId);
  const scopes: ProgramScopeAsset[] = rawScopes.map((s) => ({
    id: s.id,
    assetIdentifier: s.assetIdentifier,
    assetType: s.assetType as ProgramScopeAsset["assetType"],
    isInScope: s.isInScope ?? true,
    maxSeverityAllowed: s.maxSeverityAllowed,
    instructionNotes: s.instructionNotes,
  }));

  const rulesMeta = (program.rulesMetadata ?? {}) as Record<string, unknown>;
  const excludedCategories = Array.isArray(rulesMeta.excludedCategories)
    ? rulesMeta.excludedCategories.filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  const result = evaluateTargetScope({
    target: body.targetAsset.trim(),
    scopes,
    category: body.category,
    excludedCategories,
    isIntrusive: body.isIntrusive ?? false,
  });

  cyberRepository
    .logAuditEvent({
      userId: access.session.user.id,
      eventType: "scope_preflight_check",
      severity: result.isInScope ? "info" : "warning",
      details: {
        programId: body.programId,
        targetAsset: body.targetAsset.trim(),
        category: body.category ?? null,
        isIntrusive: body.isIntrusive ?? false,
        result: result.status,
        reason: result.reason,
      },
    })
    .catch(() => {});

  return NextResponse.json({
    status: result.status,
    isInScope: result.isInScope,
    isCategoryExcluded: result.isCategoryExcluded,
    reason: result.reason,
    matchedAssetIdentifier: result.matchedAsset?.assetIdentifier ?? null,
    matchedAsset: result.matchedAsset ?? null,
    policyCitations: result.policyCitations,
  });
}

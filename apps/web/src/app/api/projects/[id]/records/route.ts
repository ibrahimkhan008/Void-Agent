import { listProjectRecords } from "@/lib/db/pg/repositories/project-records-repository.pg";
import {
  requireProjectAccess,
  toProjectErrorResponse,
} from "@/lib/projects/access";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const { actor } = await requireProjectAccess({ projectId });
    const records = await listProjectRecords(projectId, actor.userId);
    return NextResponse.json({ records });
  } catch (err) {
    return toProjectErrorResponse(err);
  }
}

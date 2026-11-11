import { bugReportRepository } from "lib/db/repository";
import { getBugBountyProgram } from "lib/bug-bounty";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public: program settings, leaderboard and aggregate stats contain no
// owner-scoped data, so this route runs without a session.
export async function GET() {
  try {
    const [program, leaderboard, stats] = await Promise.all([
      getBugBountyProgram(),
      bugReportRepository.leaderboard(10),
      bugReportRepository.stats(),
    ]);
    return NextResponse.json({ program, leaderboard, stats });
  } catch (err) {
    console.error("[BugBounty] program error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

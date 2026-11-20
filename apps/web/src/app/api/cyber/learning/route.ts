import { requireCyberAccess } from "lib/cyber/auth";
import {
  DEFAULT_LEARNING_FILENAME,
  SELF_LEARNING_E2B_MOUNT_PATH,
  appendLearningEntry,
  buildDefaultLearningFileContent,
  countLearningEntries,
  getOrInitializeCyberLearningFile,
} from "lib/cyber/self-learning";
import { cyberRepository } from "lib/db/pg/repositories/cyber-repository.pg";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const file = await getOrInitializeCyberLearningFile(access.session.user.id);
  const url = new URL(req.url);

  if (url.searchParams.get("download") === "1") {
    return new NextResponse(file.contentMarkdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
      },
    });
  }

  return NextResponse.json({
    file,
    mountPath: SELF_LEARNING_E2B_MOUNT_PATH,
  });
}

export async function PUT(req: NextRequest) {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  let body: {
    contentMarkdown?: string;
    appendTopic?: string;
    appendLesson?: string;
    appendTactic?: string;
    targetContext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const current = await getOrInitializeCyberLearningFile(
    access.session.user.id,
  );

  // Mode 1: Direct full markdown edit
  if (typeof body.contentMarkdown === "string") {
    const trimmed = body.contentMarkdown.slice(0, 80_000);
    const updated = await cyberRepository.upsertLearningFile({
      userId: access.session.user.id,
      filename: DEFAULT_LEARNING_FILENAME,
      contentMarkdown: trimmed || buildDefaultLearningFileContent(),
      entriesCount: countLearningEntries(trimmed),
      lastLearnedSummary: "Manually updated self-learning playbook",
    });
    return NextResponse.json({ file: updated });
  }

  // Mode 2: Append a manual training lesson
  const lesson = body.appendLesson?.trim() ?? "";
  const tactic = body.appendTactic?.trim() ?? "";
  if (!lesson && !tactic) {
    return NextResponse.json(
      { error: "Provide contentMarkdown or an appendLesson / appendTactic" },
      { status: 400 },
    );
  }

  const appended = appendLearningEntry(current.contentMarkdown, {
    topic: body.appendTopic?.trim() || "Researcher Training Note",
    targetContext: body.targetContext?.trim() || undefined,
    lessons: lesson ? [lesson] : [],
    tactics: tactic ? [tactic] : [],
  });

  const updated = await cyberRepository.upsertLearningFile({
    userId: access.session.user.id,
    filename: DEFAULT_LEARNING_FILENAME,
    contentMarkdown: appended.markdown,
    entriesCount: countLearningEntries(appended.markdown),
    lastLearnedSummary: appended.summary || current.lastLearnedSummary,
  });

  return NextResponse.json({ file: updated, added: appended.added });
}

export async function DELETE() {
  const access = await requireCyberAccess(1);
  if (!access.ok) return access.response;

  const fresh = buildDefaultLearningFileContent();
  const updated = await cyberRepository.upsertLearningFile({
    userId: access.session.user.id,
    filename: DEFAULT_LEARNING_FILENAME,
    contentMarkdown: fresh,
    entriesCount: 0,
    lastLearnedSummary: null,
  });

  return NextResponse.json({ file: updated });
}

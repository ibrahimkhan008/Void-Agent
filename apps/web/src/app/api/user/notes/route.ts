import type { SavedNote, UserPreferences } from "app-types/user";
import { withAuth } from "auth/route-guard";
import { userRepository } from "lib/db/repository";
import {
  MAX_NOTE_CITATIONS,
  MAX_NOTE_MARKDOWN_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_SAVED_NOTES,
  normalizeSavedNotes,
  sanitizeNoteCitations,
} from "lib/notes";

const MAX_REQUEST_BYTES = 384 * 1024;

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new RequestBodyError(413, "Request body is too large");
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestBodyError(413, "Request body is too large");
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new RequestBodyError(400, "Invalid JSON body");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestBodyError(400, "Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

class RequestBodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function bodyError(error: unknown): Response | undefined {
  if (error instanceof RequestBodyError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return undefined;
}

async function readNotes(userId: string): Promise<SavedNote[]> {
  const preferences = await userRepository.getPreferences(userId);
  return normalizeSavedNotes(preferences?.savedNotes);
}

async function writeNotes(userId: string, savedNotes: SavedNote[]) {
  const preferences = await userRepository.getPreferences(userId);
  const nextPreferences: UserPreferences = {
    ...(preferences ?? {}),
    savedNotes,
  };
  await userRepository.updatePreferences(userId, nextPreferences);
}

function requiredText(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function validateNoteFields(
  titleValue: unknown,
  markdownValue: unknown,
): { title: string; markdown: string } | Response {
  const title = requiredText(titleValue);
  const markdown = requiredText(markdownValue);
  if (!title || !markdown) {
    return Response.json(
      { error: "Title and markdown are required" },
      { status: 400 },
    );
  }
  if (title.length > MAX_NOTE_TITLE_LENGTH) {
    return Response.json(
      { error: `Title exceeds ${MAX_NOTE_TITLE_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (markdown.length > MAX_NOTE_MARKDOWN_LENGTH) {
    return Response.json(
      { error: `Markdown exceeds ${MAX_NOTE_MARKDOWN_LENGTH} characters` },
      { status: 400 },
    );
  }
  return { title, markdown };
}

export const GET = withAuth(async (_request, session) => {
  try {
    return Response.json(await readNotes(session.user.id));
  } catch {
    return Response.json(
      { error: "Failed to fetch saved notes" },
      { status: 500 },
    );
  }
});

export const POST = withAuth(async (request, session) => {
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    return (
      bodyError(error) ??
      Response.json({ error: "Invalid request" }, { status: 400 })
    );
  }

  const fields = validateNoteFields(body.title, body.markdown);
  if (fields instanceof Response) return fields;
  if (
    Array.isArray(body.citations) &&
    body.citations.length > MAX_NOTE_CITATIONS
  ) {
    return Response.json(
      { error: `At most ${MAX_NOTE_CITATIONS} citations are allowed` },
      { status: 400 },
    );
  }

  try {
    const notes = await readNotes(session.user.id);
    const now = new Date().toISOString();
    const note: SavedNote = {
      id: crypto.randomUUID(),
      ...fields,
      citations: sanitizeNoteCitations(body.citations),
      createdAt: now,
      updatedAt: now,
    };
    await writeNotes(
      session.user.id,
      [note, ...notes].slice(0, MAX_SAVED_NOTES),
    );
    return Response.json(note, { status: 201 });
  } catch {
    return Response.json({ error: "Failed to save note" }, { status: 500 });
  }
});

export const PUT = withAuth(async (request, session) => {
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    return (
      bodyError(error) ??
      Response.json({ error: "Invalid request" }, { status: 400 })
    );
  }

  const id = requiredText(body.id);
  if (!id || id.length > 100) {
    return Response.json(
      { error: "A valid note ID is required" },
      { status: 400 },
    );
  }
  const fields = validateNoteFields(body.title, body.markdown);
  if (fields instanceof Response) return fields;
  if (
    Array.isArray(body.citations) &&
    body.citations.length > MAX_NOTE_CITATIONS
  ) {
    return Response.json(
      { error: `At most ${MAX_NOTE_CITATIONS} citations are allowed` },
      { status: 400 },
    );
  }

  try {
    const notes = await readNotes(session.user.id);
    const index = notes.findIndex((note) => note.id === id);
    if (index < 0)
      return Response.json({ error: "Note not found" }, { status: 404 });

    const updated: SavedNote = {
      ...notes[index],
      ...fields,
      citations: sanitizeNoteCitations(body.citations),
      updatedAt: new Date().toISOString(),
    };
    const next = [...notes];
    next[index] = updated;
    await writeNotes(session.user.id, next);
    return Response.json(updated);
  } catch {
    return Response.json({ error: "Failed to update note" }, { status: 500 });
  }
});

export const DELETE = withAuth(async (request, session) => {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || id.length > 100) {
    return Response.json(
      { error: "A valid note ID is required" },
      { status: 400 },
    );
  }

  try {
    const notes = await readNotes(session.user.id);
    const next = notes.filter((note) => note.id !== id);
    if (next.length === notes.length) {
      return Response.json({ error: "Note not found" }, { status: 404 });
    }
    await writeNotes(session.user.id, next);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Failed to delete note" }, { status: 500 });
  }
});

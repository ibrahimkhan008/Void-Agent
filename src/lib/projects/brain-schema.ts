import { createHash } from "node:crypto";
import { z } from "zod";

export function projectBrainSourceFingerprint(
  itemId: string,
  sourceText: string,
) {
  return createHash("sha256")
    .update(itemId)
    .update("\0")
    .update(sourceText)
    .digest("hex");
}

/** Normalize labels the same way for project-scoped typed page identity. */
export function normalizeProjectBrainLabel(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

const ProjectBrainFactSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  predicate: z.string().trim().min(1).max(160),
  object: z.string().trim().min(1).max(500),
  evidence: z.string().trim().min(1).max(1200),
  confidence: z.number().min(0).max(1),
});

const ProjectBrainTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().max(1200).default(""),
  evidence: z.string().trim().min(1).max(1200),
  dueDate: z.string().date().optional(),
});

const ProjectBrainEntitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  type: z.enum([
    "person",
    "organization",
    "project",
    "course",
    "task",
    "meeting",
    "document",
    "decision",
    "topic",
    "concept",
    "tool",
    "agent",
    "other",
  ]),
  title: z.string().trim().min(1).max(160),
  aliases: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  summary: z.string().trim().max(500).optional(),
  evidence: z.string().trim().min(1).max(1200),
  facts: z
    .array(
      z.object({
        predicate: z.string().trim().min(1).max(160),
        value: z.string().trim().min(1).max(500),
        evidence: z.string().trim().min(1).max(1200),
        confidence: z.number().min(0).max(1).default(1),
      }),
    )
    .max(10)
    .default([]),
});

const ProjectBrainRelationSchema = z.object({
  fromEntityId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  toEntityId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  type: z.string().trim().min(1).max(80),
  context: z.string().trim().max(500).optional(),
  evidence: z.string().trim().min(1).max(1200),
  confidence: z.number().min(0).max(1).default(1),
});

function resilientArray<T extends z.ZodTypeAny>(schema: T) {
  return (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item) => schema.safeParse(item).success)
      : value;
}

export const ProjectBrainExtractionSchema = z
  .object({
    todos: z.preprocess(
      resilientArray(ProjectBrainTaskSchema),
      z.array(ProjectBrainTaskSchema).max(40).default([]),
    ),
    facts: z.preprocess(
      resilientArray(ProjectBrainFactSchema),
      z.array(ProjectBrainFactSchema).max(40).default([]),
    ),
    entities: z.preprocess(
      resilientArray(ProjectBrainEntitySchema),
      z.array(ProjectBrainEntitySchema).max(30).default([]),
    ),
    relations: z.preprocess(
      resilientArray(ProjectBrainRelationSchema),
      z.array(ProjectBrainRelationSchema).max(60).default([]),
    ),
  })
  .transform((value) => {
    const entityIds = new Set<string>();
    const entities = value.entities.filter((entity) => {
      if (entityIds.has(entity.id)) return false;
      entityIds.add(entity.id);
      return true;
    });
    return {
      ...value,
      entities,
      relations: value.relations.filter(
        (relation) =>
          relation.fromEntityId !== relation.toEntityId &&
          entityIds.has(relation.fromEntityId) &&
          entityIds.has(relation.toEntityId),
      ),
    };
  });

export type ProjectBrainExtraction = z.infer<
  typeof ProjectBrainExtractionSchema
>;

/** Keep only actionable task proposals whose evidence occurs in the source. */
export function projectBrainExtractionToTodos(
  extraction: ProjectBrainExtraction,
  sourceText: string,
) {
  const normalize = (value: string) =>
    value.toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  const normalizedSource = normalize(sourceText);
  const seen = new Set<string>();
  return extraction.todos.filter((todo) => {
    if (!normalizedSource.includes(normalize(todo.evidence))) return false;
    const key = `${normalize(todo.title)}\u0000${normalize(todo.evidence)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type ProjectBrainPageIdentityInput = {
  id: string;
  entityType: ProjectBrainExtraction["entities"][number]["type"];
  title: string;
};

/** Do not materialize entities unless their typed identity claim is source-grounded. */
export function getGroundedProjectBrainEntities(
  extraction: ProjectBrainExtraction,
  facts: ProjectBrainExtraction["facts"],
) {
  const groundedKeys = new Set(
    facts
      .filter(
        (fact) => normalizeProjectBrainLabel(fact.predicate) === "entity type",
      )
      .map(
        (fact) =>
          `${normalizeProjectBrainLabel(fact.object)}\u0000${normalizeProjectBrainLabel(fact.subject)}`,
      ),
  );
  return extraction.entities.filter((entity) =>
    groundedKeys.has(
      `${entity.type}\u0000${normalizeProjectBrainLabel(entity.title)}`,
    ),
  );
}

/** Link only explicit/unique extracted identities; leave ambiguous labels unlinked. */
export function linkProjectBrainFactsToPages(
  extraction: ProjectBrainExtraction,
  facts: ProjectBrainExtraction["facts"],
  pages: ProjectBrainPageIdentityInput[],
) {
  const pageByTypeAndTitle = new Map<string, string>();
  const pageIdsByTitle = new Map<string, Set<string>>();
  for (const page of pages) {
    const normalizedTitle = normalizeProjectBrainLabel(page.title);
    pageByTypeAndTitle.set(
      `${page.entityType}\u0000${normalizedTitle}`,
      page.id,
    );
    const ids = pageIdsByTitle.get(normalizedTitle) ?? new Set<string>();
    ids.add(page.id);
    pageIdsByTitle.set(normalizedTitle, ids);
  }

  const aliasPageByClaim = new Map<string, string>();
  for (const entity of getGroundedProjectBrainEntities(extraction, facts)) {
    const normalizedTitle = normalizeProjectBrainLabel(entity.title);
    const pageId = pageByTypeAndTitle.get(
      `${entity.type}\u0000${normalizedTitle}`,
    );
    // The alias fact shape does not include the entity type. If equal titles
    // exist across types, do not attach it to one page by extraction order.
    if (!pageId || pageIdsByTitle.get(normalizedTitle)?.size !== 1) continue;
    for (const alias of entity.aliases) {
      aliasPageByClaim.set(
        [
          normalizedTitle,
          "also known as",
          normalizeProjectBrainLabel(alias),
          normalizeProjectBrainLabel(entity.evidence),
        ].join("\u0000"),
        pageId,
      );
    }
  }

  const relationPageByClaim = new Map<
    string,
    { subjectPageId: string; objectPageId: string }
  >();
  const entitiesById = new Map(
    getGroundedProjectBrainEntities(extraction, facts).map((entity) => [
      entity.id,
      entity,
    ]),
  );
  for (const relation of extraction.relations) {
    const subject = entitiesById.get(relation.fromEntityId);
    const object = entitiesById.get(relation.toEntityId);
    if (!subject || !object) continue;
    const subjectPageId = pageByTypeAndTitle.get(
      `${subject.type}\u0000${normalizeProjectBrainLabel(subject.title)}`,
    );
    const objectPageId = pageByTypeAndTitle.get(
      `${object.type}\u0000${normalizeProjectBrainLabel(object.title)}`,
    );
    if (!subjectPageId || !objectPageId) continue;
    relationPageByClaim.set(
      [
        normalizeProjectBrainLabel(subject.title),
        normalizeProjectBrainLabel(relation.type),
        normalizeProjectBrainLabel(object.title),
        normalizeProjectBrainLabel(relation.evidence),
      ].join("\u0000"),
      { subjectPageId, objectPageId },
    );
  }

  return facts.map((fact) => {
    const normalizedSubject = normalizeProjectBrainLabel(fact.subject);
    const normalizedPredicate = normalizeProjectBrainLabel(fact.predicate);
    const normalizedObject = normalizeProjectBrainLabel(fact.object);
    const claimKey = [
      normalizedSubject,
      normalizedPredicate,
      normalizedObject,
      normalizeProjectBrainLabel(fact.evidence),
    ].join("\u0000");
    const relation = relationPageByClaim.get(claimKey);
    const subjectPageId =
      relation?.subjectPageId ??
      (normalizedPredicate === "entity type"
        ? pageByTypeAndTitle.get(
            `${normalizedObject}\u0000${normalizedSubject}`,
          )
        : (aliasPageByClaim.get(claimKey) ??
          (pageIdsByTitle.get(normalizedSubject)?.size === 1
            ? [...pageIdsByTitle.get(normalizedSubject)!][0]
            : undefined)));
    const objectPageId = relation?.objectPageId;
    return {
      ...fact,
      subjectPageId: subjectPageId ?? null,
      objectPageId: objectPageId ?? null,
    };
  });
}

/** Adapt the richer entity/edge extraction to Void-Agent's reviewable triples. */
export function projectBrainExtractionToFacts(
  extraction: ProjectBrainExtraction,
  sourceText?: string,
  maxFacts = 100,
) {
  const entities = new Map(
    extraction.entities.map((entity) => [entity.id, entity]),
  );
  const structuredFacts: ProjectBrainExtraction["facts"] = [];

  for (const entity of extraction.entities) {
    structuredFacts.push({
      subject: entity.title,
      predicate: "entity type",
      object: entity.type,
      evidence: entity.evidence,
      confidence: 1,
    });
    if (entity.summary) {
      structuredFacts.push({
        subject: entity.title,
        predicate: "summary",
        object: entity.summary,
        evidence: entity.evidence,
        confidence: 1,
      });
    }
    for (const alias of entity.aliases) {
      structuredFacts.push({
        subject: entity.title,
        predicate: "also known as",
        object: alias,
        evidence: entity.evidence,
        confidence: 1,
      });
    }
    for (const fact of entity.facts) {
      structuredFacts.push({
        subject: entity.title,
        predicate: fact.predicate,
        object: fact.value,
        evidence: fact.evidence,
        confidence: fact.confidence,
      });
    }
  }

  for (const relation of extraction.relations) {
    const from = entities.get(relation.fromEntityId);
    const to = entities.get(relation.toEntityId);
    if (!from || !to) continue;
    structuredFacts.push({
      subject: from.title,
      predicate: relation.type,
      object: to.title,
      evidence: relation.evidence,
      confidence: relation.confidence,
    });
  }

  const groundedFacts = [...extraction.facts, ...structuredFacts].filter(
    (fact) => {
      if (sourceText === undefined) return true;
      const normalizeEvidence = (value: string) =>
        value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
      return normalizeEvidence(sourceText).includes(
        normalizeEvidence(fact.evidence),
      );
    },
  );

  return deduplicateProjectFacts(groundedFacts).slice(0, maxFacts);
}

export function deduplicateProjectFacts(
  facts: ProjectBrainExtraction["facts"],
) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = [fact.subject, fact.predicate, fact.object]
      .map((part) => part.trim().toLocaleLowerCase())
      .join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isProjectBrainRunRecoverable(
  status: string,
  updatedAt: Date,
  now = Date.now(),
) {
  if (status === "failed") return true;
  return status === "running" && now - updatedAt.getTime() > 5 * 60_000;
}

export function isProjectBrainRunClaimable(
  status: string,
  updatedAt: Date,
  now = Date.now(),
) {
  return (
    status === "queued" || isProjectBrainRunRecoverable(status, updatedAt, now)
  );
}

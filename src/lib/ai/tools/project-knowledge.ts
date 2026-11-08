import "server-only";

import { tool } from "ai";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectBrainEventTable,
  ProjectBrainFactTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import { projectBrainRunIsActiveSourceRevision } from "lib/projects/brain-source-state";
import { z } from "zod";

const inputSchema = z.object({
  query: z.string().trim().min(2).max(300),
});

const queryTerms = (query: string) =>
  [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(
    0,
    12,
  );

const escapeLikeTerm = (term: string) => term.replace(/[\\%_]/gu, "\\$&");

const normalizeEntity = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const aliasPredicates = new Set(["alias", "also known as"]);

/**
 * Exposes reviewed project facts to chat while rechecking workspace membership
 * and the current project collection scope at execution time.
 */
export function createProjectKnowledgeGraphTool(args: {
  userId: string;
  projectId: string;
  collectionIds: string[];
}) {
  return tool({
    description:
      "Search the current project's reviewed knowledge graph for entities, relationships, and facts, and include its most recent human-accepted timeline events when available. Only human-accepted claims and events from currently accessible sources are returned. Cite the source name and evidence excerpt in your answer; do not treat model confidence as proof.",
    inputSchema,
    execute: async ({ query }) => {
      const terms = queryTerms(query);
      if (!terms.length)
        return {
          success: true,
          results: [],
          message: "Use a query with at least one searchable term.",
        };

      const access = await getProjectAccess(args.projectId, args.userId);
      if (!access)
        return {
          success: false,
          error: "This project is no longer available to you.",
        };
      const collectionIds = args.collectionIds.filter((id) =>
        access.project.collectionIds.includes(id),
      );
      if (!collectionIds.length)
        return {
          success: true,
          results: [],
          message:
            "No knowledge collections are attached to this conversation.",
        };
      const ownerIds = await getProjectCollectionSourceOwnerIds(access);
      if (!ownerIds.length)
        return {
          success: true,
          results: [],
          message: "No accessible project sources were found.",
        };

      const recentEvents = await pgDb
        .select({
          id: ProjectBrainEventTable.id,
          summary: ProjectBrainEventTable.summary,
          detail: ProjectBrainEventTable.detail,
          eventDate: ProjectBrainEventTable.eventDate,
          evidence: ProjectBrainEventTable.evidence,
          sourceItemId: ProjectBrainEventTable.sourceItemId,
          filename: CollectionItemTable.filename,
          sourceUrl: CollectionItemTable.sourceUrl,
          sourceCollectionId: CollectionItemTable.collectionId,
          sourceOwnerId: CollectionTable.userId,
          sourceStatus: CollectionItemTable.status,
          eventStatus: ProjectBrainEventTable.status,
        })
        .from(ProjectBrainEventTable)
        .innerJoin(
          CollectionItemTable,
          eq(CollectionItemTable.id, ProjectBrainEventTable.sourceItemId),
        )
        .innerJoin(
          CollectionTable,
          eq(CollectionTable.id, CollectionItemTable.collectionId),
        )
        .where(
          and(
            eq(ProjectBrainEventTable.projectId, args.projectId),
            projectBrainRunIsActiveSourceRevision(
              ProjectBrainEventTable.runId,
              ProjectBrainEventTable.projectId,
              ProjectBrainEventTable.sourceItemId,
              ProjectBrainEventTable.chatSourceId,
            ),
            eq(ProjectBrainEventTable.status, "accepted"),
            inArray(CollectionItemTable.collectionId, collectionIds),
            inArray(CollectionTable.userId, ownerIds),
            eq(CollectionItemTable.status, "ready"),
          ),
        )
        .orderBy(
          desc(ProjectBrainEventTable.eventDate),
          desc(ProjectBrainEventTable.createdAt),
        )
        .limit(8);
      const visibleRecentEvents = recentEvents
        .filter(
          (event) =>
            event.eventStatus === "accepted" &&
            event.sourceStatus === "ready" &&
            Boolean(event.sourceItemId) &&
            collectionIds.includes(event.sourceCollectionId) &&
            ownerIds.includes(event.sourceOwnerId),
        )
        .map((event) => ({
          id: event.id,
          date: event.eventDate ? String(event.eventDate) : null,
          summary: event.summary.slice(0, 240),
          detail: (event.detail ?? "").slice(0, 600),
          evidence: event.evidence.slice(0, 300),
          source:
            event.filename ||
            event.sourceUrl ||
            `Source ${(event.sourceItemId ?? "").slice(0, 8)}`,
        }));

      const baseSelect = () =>
        pgDb
          .select({
            id: ProjectBrainFactTable.id,
            subject: ProjectBrainFactTable.subject,
            predicate: ProjectBrainFactTable.predicate,
            object: ProjectBrainFactTable.object,
            evidence: ProjectBrainFactTable.evidence,
            confidence: ProjectBrainFactTable.confidence,
            sourceItemId: ProjectBrainFactTable.sourceItemId,
            filename: CollectionItemTable.filename,
            sourceUrl: CollectionItemTable.sourceUrl,
            sourceCollectionId: CollectionItemTable.collectionId,
            sourceOwnerId: CollectionTable.userId,
            sourceStatus: CollectionItemTable.status,
            reviewStatus: ProjectBrainFactTable.reviewStatus,
            createdAt: ProjectBrainFactTable.createdAt,
          })
          .from(ProjectBrainFactTable)
          .innerJoin(
            CollectionItemTable,
            eq(CollectionItemTable.id, ProjectBrainFactTable.sourceItemId),
          )
          .innerJoin(
            CollectionTable,
            eq(CollectionTable.id, CollectionItemTable.collectionId),
          );
      // Search in Postgres before applying the result cap. The previous
      // implementation loaded the newest 500 accepted facts for the project
      // and then searched that in memory, which made older but relevant facts
      // unreachable once a project accumulated enough history. Terms are
      // parameterized and bounded by queryTerms; wildcard characters are
      // escaped so user input cannot widen the LIKE pattern.
      const searchFields = [
        ProjectBrainFactTable.subject,
        ProjectBrainFactTable.predicate,
        ProjectBrainFactTable.object,
        ProjectBrainFactTable.evidence,
      ] as const;
      const termMatches = terms.flatMap((term) => {
        const pattern = `%${escapeLikeTerm(term)}%`;
        return searchFields.map((field) => ilike(field, pattern));
      });
      const scoreExpression = sql<number>`(${sql.join(
        terms.map((term) => {
          const pattern = `%${escapeLikeTerm(term)}%`;
          const matchingField = sql.join(
            searchFields.map((field) => sql`${field} ILIKE ${pattern}`),
            sql` OR `,
          );
          return sql`CASE WHEN (${matchingField}) THEN 1 ELSE 0 END`;
        }),
        sql` + `,
      )})`;
      const rows = await baseSelect()
        .where(
          and(
            eq(ProjectBrainFactTable.projectId, args.projectId),
            projectBrainRunIsActiveSourceRevision(
              ProjectBrainFactTable.runId,
              ProjectBrainFactTable.projectId,
              ProjectBrainFactTable.sourceItemId,
              ProjectBrainFactTable.chatSourceId,
            ),
            eq(ProjectBrainFactTable.reviewStatus, "accepted"),
            inArray(CollectionItemTable.collectionId, collectionIds),
            inArray(CollectionTable.userId, ownerIds),
            eq(CollectionItemTable.status, "ready"),
            sql`(${sql.join(termMatches, sql` OR `)})`,
          ),
        )
        .orderBy(desc(scoreExpression), desc(ProjectBrainFactTable.createdAt))
        .limit(300);

      const currentRows = rows.filter(
        (fact) =>
          fact.reviewStatus === "accepted" &&
          fact.sourceStatus === "ready" &&
          collectionIds.includes(fact.sourceCollectionId) &&
          ownerIds.includes(fact.sourceOwnerId),
      );
      const aliasEntityIds = [
        ...new Set(
          currentRows
            .filter((fact) => {
              const predicate = normalizeEntity(fact.predicate);
              const aliasText = normalizeEntity(fact.object);
              return (
                aliasPredicates.has(predicate) &&
                terms.some((term) => aliasText.includes(term))
              );
            })
            .map((fact) => normalizeEntity(fact.subject))
            .filter(Boolean),
        ),
      ].slice(0, 25);

      let expandedRows: typeof rows = [];
      if (aliasEntityIds.length) {
        const entityArray = sql`ARRAY[${sql.join(
          aliasEntityIds.map((entityId) => sql`${entityId}`),
          sql`, `,
        )}]::text[]`;
        const normalizedSubject = sql`lower(trim(regexp_replace(${ProjectBrainFactTable.subject}, '[[:space:]]+', ' ', 'g'))) = ANY(${entityArray})`;
        const normalizedObject = sql`lower(trim(regexp_replace(${ProjectBrainFactTable.object}, '[[:space:]]+', ' ', 'g'))) = ANY(${entityArray})`;
        expandedRows = await baseSelect()
          .where(
            and(
              eq(ProjectBrainFactTable.projectId, args.projectId),
              projectBrainRunIsActiveSourceRevision(
                ProjectBrainFactTable.runId,
                ProjectBrainFactTable.projectId,
                ProjectBrainFactTable.sourceItemId,
                ProjectBrainFactTable.chatSourceId,
              ),
              eq(ProjectBrainFactTable.reviewStatus, "accepted"),
              inArray(CollectionItemTable.collectionId, collectionIds),
              inArray(CollectionTable.userId, ownerIds),
              eq(CollectionItemTable.status, "ready"),
              sql`(${normalizedSubject} OR ${normalizedObject})`,
            ),
          )
          .orderBy(desc(ProjectBrainFactTable.createdAt))
          .limit(100);
      }
      const accessibleExpandedRows = expandedRows.filter(
        (fact) =>
          fact.reviewStatus === "accepted" &&
          fact.sourceStatus === "ready" &&
          collectionIds.includes(fact.sourceCollectionId) &&
          ownerIds.includes(fact.sourceOwnerId),
      );
      const directFactIds = new Set(
        currentRows
          .filter((fact) => {
            const searchable =
              `${fact.subject} ${fact.predicate} ${fact.object} ${fact.evidence}`.toLowerCase();
            return terms.some((term) => searchable.includes(term));
          })
          .map((fact) => fact.id),
      );
      const expandedById = new Map(
        [...currentRows, ...accessibleExpandedRows].map((fact) => [
          fact.id,
          fact,
        ]),
      );
      const retrievalRows = [...expandedById.values()];

      const results = retrievalRows
        .map((fact) => {
          const haystack =
            `${fact.subject} ${fact.predicate} ${fact.object} ${fact.evidence}`.toLowerCase();
          const score = terms.reduce(
            (total, term) => total + (haystack.includes(term) ? 1 : 0),
            0,
          );
          const relatedEntity = aliasEntityIds.some(
            (entityId) =>
              entityId === normalizeEntity(fact.subject) ||
              entityId === normalizeEntity(fact.object),
          );
          return { ...fact, score, relatedEntity };
        })
        .filter((fact) => fact.score > 0 || fact.relatedEntity)
        .sort(
          (a, b) =>
            Number(b.score > 0) - Number(a.score > 0) ||
            b.score - a.score ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .slice(0, 12)
        .map(
          ({
            id,
            subject,
            predicate,
            object,
            evidence,
            confidence,
            sourceItemId,
            filename,
            sourceUrl,
          }) => ({
            id,
            claim: `${subject} ${predicate} ${object}`,
            evidence,
            confidence,
            source:
              filename ||
              sourceUrl ||
              `Source ${(sourceItemId ?? "").slice(0, 8)}`,
            sourceItemId: sourceItemId ?? "",
            matchedBy: directFactIds.has(id) ? "text" : "entity-or-alias",
          }),
        );

      return {
        success: true,
        results,
        recentEvents: visibleRecentEvents,
        message: results.length
          ? "These are human-reviewed claims and recent accepted timeline events. Cite each source and evidence excerpt; mention when evidence is limited."
          : "No matching human-reviewed project claims were found. Recent accepted timeline events, if any, are provided separately. Use the project's attached knowledge search for unstructured document content.",
      };
    },
  });
}

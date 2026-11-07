import { describe, expect, it } from "vitest";
import {
  ProjectBrainExtractionSchema,
  deduplicateProjectFacts,
  getGroundedProjectBrainEntities,
  isProjectBrainRunClaimable,
  isProjectBrainRunRecoverable,
  linkProjectBrainFactsToPages,
  normalizeProjectBrainLabel,
  projectBrainExtractionToFacts,
  projectBrainExtractionToTimeline,
  projectBrainExtractionToTodos,
  projectBrainSourceFingerprint,
} from "./brain-schema";

describe("project brain extraction contract", () => {
  it("normalizes page identity labels consistently", () => {
    expect(normalizeProjectBrainLabel("  Northstar\t Systems  ")).toBe(
      "northstar systems",
    );
    expect(normalizeProjectBrainLabel("  ")).toBe("");
  });

  it("bounds the number and size of proposed facts", () => {
    const fact = {
      subject: "Project",
      predicate: "has goal",
      object: "Ship the release",
      evidence: "The stated goal is to ship the release.",
      confidence: 0.9,
    };
    expect(
      ProjectBrainExtractionSchema.safeParse({ facts: [fact] }).success,
    ).toBe(true);
    expect(
      ProjectBrainExtractionSchema.safeParse({ facts: Array(41).fill(fact) })
        .success,
    ).toBe(false);
    expect(
      ProjectBrainExtractionSchema.safeParse({
        facts: [{ ...fact, confidence: 2 }],
      }).data?.facts,
    ).toEqual([]);
  });

  it("keeps valid entities and relations while dropping duplicate and dangling graph edges", () => {
    const result = ProjectBrainExtractionSchema.parse({
      entities: [
        {
          id: "team",
          type: "organization",
          title: "Northstar",
          aliases: ["North Star"],
          evidence: "Northstar is the company.",
        },
        {
          id: "launch",
          type: "project",
          title: "Launch",
          evidence: "The Launch project is active.",
        },
        {
          id: "launch",
          type: "project",
          title: "Duplicate",
          evidence: "Duplicate evidence.",
        },
      ],
      relations: [
        {
          fromEntityId: "team",
          toEntityId: "launch",
          type: "owns",
          evidence: "Northstar owns the Launch project.",
        },
        {
          fromEntityId: "team",
          toEntityId: "missing",
          type: "owns",
          evidence: "No entity.",
        },
        {
          fromEntityId: "launch",
          toEntityId: "launch",
          type: "related to",
          evidence: "Self edge.",
        },
      ],
    });
    expect(result.entities.map((entity) => entity.title)).toEqual([
      "Northstar",
      "Launch",
    ]);
    expect(result.relations).toHaveLength(1);
  });

  it("maps entity attributes, aliases, and explicit relations into reviewable triples", () => {
    const extraction = ProjectBrainExtractionSchema.parse({
      entities: [
        {
          id: "person",
          type: "person",
          title: "Riya",
          aliases: ["R. Shah"],
          evidence: "Riya (R. Shah) leads the launch.",
          facts: [
            {
              predicate: "role",
              value: "launch lead",
              evidence: "Riya (R. Shah) leads the launch.",
              confidence: 0.9,
            },
          ],
        },
        {
          id: "project",
          type: "project",
          title: "Launch",
          evidence: "the launch project",
        },
      ],
      relations: [
        {
          fromEntityId: "person",
          toEntityId: "project",
          type: "leads",
          evidence: "Riya (R. Shah) leads the launch.",
          confidence: 0.95,
        },
      ],
    });
    const facts = projectBrainExtractionToFacts(
      extraction,
      "Riya (R. Shah) leads the launch. The Launch project exists.",
    );
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: "Riya",
          predicate: "entity type",
          object: "person",
        }),
        expect.objectContaining({
          subject: "Riya",
          predicate: "also known as",
          object: "R. Shah",
        }),
        expect.objectContaining({
          subject: "Riya",
          predicate: "role",
          object: "launch lead",
          confidence: 0.9,
        }),
        expect.objectContaining({
          subject: "Riya",
          predicate: "leads",
          object: "Launch",
          confidence: 0.95,
        }),
      ]),
    );
    expect(facts.every((fact) => fact.evidence.length > 0)).toBe(true);
    expect(
      projectBrainExtractionToFacts(extraction, "No source support here."),
    ).toEqual([]);
  });

  it("keeps only deduplicated todo proposals with source-grounded exact evidence", () => {
    const extraction = ProjectBrainExtractionSchema.parse({
      todos: [
        {
          title: "Send launch plan",
          details: "Email the team",
          evidence: "Send the launch plan to the team by Friday.",
          dueDate: "2026-11-13",
        },
        {
          title: "Send launch plan",
          details: "Email the team",
          evidence: "Send the launch plan to the team by Friday.",
        },
        {
          title: "Invent a task",
          evidence: "This sentence is not in the source.",
        },
      ],
    });
    expect(
      projectBrainExtractionToTodos(
        extraction,
        "Please send the launch plan to the team by Friday.",
      ),
    ).toEqual([
      expect.objectContaining({
        title: "Send launch plan",
        dueDate: "2026-11-13",
      }),
    ]);
  });

  it("keeps only bounded, deduplicated timeline proposals with exact source evidence", () => {
    const extraction = ProjectBrainExtractionSchema.parse({
      timeline: [
        {
          summary: "Launch review",
          detail: "The team reviewed the release plan.",
          evidence: "The team reviewed the release plan on 2026-10-20.",
          eventDate: "2026-10-20",
        },
        {
          summary: "Launch review",
          detail: "The team reviewed the release plan.",
          evidence: "The team reviewed the release plan on 2026-10-20.",
          eventDate: "2026-10-20",
        },
        {
          summary: "Invented meeting",
          evidence: "This meeting happened, but it is not in the source.",
          eventDate: "2026-10-19",
        },
        {
          summary: "Undated decision",
          evidence: "We decided to keep the current launch scope.",
        },
      ],
    });

    expect(
      projectBrainExtractionToTimeline(
        extraction,
        "The team reviewed the release plan on 2026-10-20. We decided to keep the current launch scope.",
      ),
    ).toEqual([
      expect.objectContaining({
        summary: "Launch review",
        eventDate: "2026-10-20",
      }),
      expect.objectContaining({ summary: "Undated decision" }),
    ]);
    expect(
      ProjectBrainExtractionSchema.safeParse({
        timeline: Array(21).fill({
          summary: "Event",
          evidence: "Evidence",
        }),
      }).success,
    ).toBe(false);
  });

  it("links claims to typed page IDs and leaves ambiguous labels unlinked", () => {
    const extraction = ProjectBrainExtractionSchema.parse({
      entities: [
        {
          id: "person",
          type: "person",
          title: "Riya",
          aliases: ["R. Shah"],
          evidence: "Riya is R. Shah.",
        },
        {
          id: "project",
          type: "project",
          title: "Launch",
          evidence: "The Launch project is active.",
        },
        {
          id: "topic",
          type: "topic",
          title: "Mercury",
          aliases: ["Merc"],
          evidence: "Mercury is a topic.",
        },
        {
          id: "organization",
          type: "organization",
          title: "Mercury",
          aliases: ["Merc"],
          evidence: "Mercury is a company.",
        },
      ],
      relations: [
        {
          fromEntityId: "person",
          toEntityId: "project",
          type: "leads",
          evidence: "Riya leads the Launch project.",
        },
      ],
    });
    const facts = projectBrainExtractionToFacts(extraction);
    const linked = linkProjectBrainFactsToPages(extraction, facts, [
      { id: "page-riya", entityType: "person", title: "Riya" },
      { id: "page-launch", entityType: "project", title: "Launch" },
      { id: "page-mercury-topic", entityType: "topic", title: "Mercury" },
      { id: "page-mercury-org", entityType: "organization", title: "Mercury" },
    ]);

    expect(
      linked.find(
        (fact) => fact.predicate === "entity type" && fact.object === "person",
      )?.subjectPageId,
    ).toBe("page-riya");
    expect(
      linked.find(
        (fact) => fact.predicate === "also known as" && fact.subject === "Riya",
      )?.subjectPageId,
    ).toBe("page-riya");
    expect(
      linked.find((fact) => fact.predicate === "leads")?.subjectPageId,
    ).toBe("page-riya");
    expect(
      linked.find((fact) => fact.predicate === "leads")?.objectPageId,
    ).toBe("page-launch");
    expect(
      linked.find(
        (fact) =>
          fact.predicate === "also known as" && fact.subject === "Mercury",
      )?.subjectPageId,
    ).toBeNull();
  });

  it("materializes pages only for source-grounded typed identity claims", () => {
    const extraction = ProjectBrainExtractionSchema.parse({
      entities: [
        {
          id: "grounded",
          type: "person",
          title: "Riya",
          evidence: "Riya leads the Launch project.",
        },
        {
          id: "ungrounded",
          type: "organization",
          title: "Northstar",
          evidence: "Northstar is an organization.",
        },
      ],
      relations: [],
    });
    const facts = projectBrainExtractionToFacts(
      extraction,
      "Riya leads the Launch project.",
    );

    expect(
      getGroundedProjectBrainEntities(extraction, facts).map(
        (entity) => entity.id,
      ),
    ).toEqual(["grounded"]);
  });

  it("deduplicates equivalent claims without merging distinct evidence", () => {
    const facts = [
      {
        subject: "Project",
        predicate: "has goal",
        object: "Ship release",
        evidence: "Quote A",
        confidence: 0.9,
      },
      {
        subject: " project ",
        predicate: "HAS GOAL",
        object: "ship release",
        evidence: "Quote B",
        confidence: 0.7,
      },
      {
        subject: "Project",
        predicate: "owner",
        object: "Alex",
        evidence: "Quote C",
        confidence: 0.8,
      },
    ];
    expect(deduplicateProjectFacts(facts)).toHaveLength(2);
  });

  it("retries failed runs and recovers abandoned runs after the lease", () => {
    const now = Date.now();
    expect(isProjectBrainRunRecoverable("failed", new Date(now), now)).toBe(
      true,
    );
    expect(
      isProjectBrainRunRecoverable("running", new Date(now - 301_000), now),
    ).toBe(true);
    expect(
      isProjectBrainRunRecoverable("running", new Date(now - 20_000), now),
    ).toBe(false);
    expect(
      isProjectBrainRunRecoverable("succeeded", new Date(now - 500_000), now),
    ).toBe(false);
  });

  it("claims queued and expired runs but leaves active and successful runs alone", () => {
    const now = Date.now();
    expect(isProjectBrainRunClaimable("queued", new Date(now), now)).toBe(true);
    expect(
      isProjectBrainRunClaimable("running", new Date(now - 301_000), now),
    ).toBe(true);
    expect(
      isProjectBrainRunClaimable("running", new Date(now - 20_000), now),
    ).toBe(false);
    expect(
      isProjectBrainRunClaimable("succeeded", new Date(now - 500_000), now),
    ).toBe(false);
  });

  it("builds a stable source fingerprint that binds both the item and exact text", () => {
    const fingerprint = projectBrainSourceFingerprint("item-a", "source text");
    expect(projectBrainSourceFingerprint("item-a", "source text")).toBe(
      fingerprint,
    );
    expect(projectBrainSourceFingerprint("item-b", "source text")).not.toBe(
      fingerprint,
    );
    expect(projectBrainSourceFingerprint("item-a", "changed text")).not.toBe(
      fingerprint,
    );
  });
});

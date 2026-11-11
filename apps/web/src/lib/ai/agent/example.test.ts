import { describe, expect, it } from "vitest";
import { DefaultToolName } from "lib/ai/tools";
import { AgentCreateSchema } from "app-types/agent";
import { RandomDataGeneratorExample, WeatherExample } from "./example";

const ALL_DEFAULT_TOOL_NAMES = new Set<string>(Object.values(DefaultToolName));

describe("agent examples", () => {
  const examples = [
    { name: "RandomDataGeneratorExample", value: RandomDataGeneratorExample },
    { name: "WeatherExample", value: WeatherExample },
  ];

  it.each(examples)(
    "$name mentions only declared DefaultToolName tools",
    ({ value }) => {
      expect(value.instructions?.mentions?.length).toBeGreaterThan(0);
      for (const mention of value.instructions?.mentions ?? []) {
        expect(mention.type).toBe("defaultTool");
        expect(ALL_DEFAULT_TOOL_NAMES.has(mention.name)).toBe(true);
      }
    },
  );

  it.each(examples)(
    "$name passes AgentCreateSchema shape checks",
    ({ value }) => {
      // The examples intentionally omit userId/visibility (they are prefills,
      // not create payloads), so validate the fields they do carry.
      expect(value.name).toEqual(expect.any(String));
      expect(value.name?.length).toBeLessThanOrEqual(100);
      expect(value.description).toEqual(expect.any(String));
      expect(value.icon?.type).toBe("emoji");
      expect(value.instructions?.systemPrompt).toEqual(expect.any(String));
      expect(AgentCreateSchema.shape.name.safeParse(value.name).success).toBe(
        true,
      );
      expect(
        AgentCreateSchema.shape.instructions.safeParse(value.instructions)
          .success,
      ).toBe(true);
      expect(AgentCreateSchema.shape.icon.safeParse(value.icon).success).toBe(
        true,
      );
    },
  );

  it("random-data example binds the JS execution and table tools", () => {
    const names = RandomDataGeneratorExample.instructions?.mentions?.map(
      (m) => m.name,
    );
    expect(names).toEqual([
      DefaultToolName.JavascriptExecution,
      DefaultToolName.CreateTable,
    ]);
  });

  it("weather example binds the HTTP tool", () => {
    const names = WeatherExample.instructions?.mentions?.map((m) => m.name);
    expect(names).toEqual([DefaultToolName.Http]);
  });
});

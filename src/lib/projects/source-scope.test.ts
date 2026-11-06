import { describe, expect, it } from "vitest";
import { mergeProjectCollectionSourceOwnerIds } from "./source-scope";

describe("project brain source owner scope", () => {
  it("adds owners of attached team collections without dropping current members", () => {
    expect(
      mergeProjectCollectionSourceOwnerIds(
        ["team-owner", "member-1"],
        ["former-member", "team-owner"],
      ),
    ).toEqual(["team-owner", "member-1", "former-member"]);
  });

  it("does not infer any additional source owners when none are supplied", () => {
    expect(mergeProjectCollectionSourceOwnerIds(["owner"], [])).toEqual([
      "owner",
    ]);
  });
});

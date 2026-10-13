/**
 * Tests for the pure characters-grid view-model.
 *
 * Resource contract: OWNS NOTHING. No database, clock, filesystem, network, or env.
 * Pure projection over caller-supplied rows — order-independent, needs no teardown.
 */
import { describe, expect, test, } from "bun:test";
import { buildCharactersGridViewModel, type CharacterGridActorRow, } from "./characters-grid";

/**
 * @param overrides
 */
function actor(overrides: Partial<CharacterGridActorRow> = {},): CharacterGridActorRow {
  return {
    id: "actor-1",
    display_name: "Aria",
    description: "A desc",
    avatar_asset_id: null,
    review_state: "approved",
    ...overrides,
  };
}

describe("view-models/characters-grid", () => {
  test("returns an empty characters array for no rows", () => {
    expect(buildCharactersGridViewModel({ actors: [], },),).toEqual({ characters: [], },);
  });

  test("projects id, display name and review state", () => {
    const { characters, } = buildCharactersGridViewModel({ actors: [actor(),], },);

    expect(characters,).toHaveLength(1,);
    expect(characters[0],).toEqual({
      id: "actor-1",
      displayName: "Aria",
      description: "A desc",
      avatarUrl: null,
      reviewState: "approved",
    },);
  });

  test("derives the avatar thumb url from the asset id", () => {
    const { characters, } = buildCharactersGridViewModel({
      actors: [actor({ avatar_asset_id: "asset-9", },),],
    },);

    expect(characters[0]?.avatarUrl,).toBe("/api/v1/assets/asset-9/thumb",);
  });

  test("normalises a null description to an empty string", () => {
    const { characters, } = buildCharactersGridViewModel({
      actors: [actor({ description: null, },),],
    },);

    expect(characters[0]?.description,).toBe("",);
  });

  test("falls back to pending_review when review_state is empty", () => {
    const { characters, } = buildCharactersGridViewModel({
      actors: [actor({ review_state: "", },),],
    },);

    expect(characters[0]?.reviewState,).toBe("pending_review",);
  });

  test("preserves the given row order", () => {
    const { characters, } = buildCharactersGridViewModel({
      actors: [
        actor({ id: "actor-z", display_name: "Zed", },),
        actor({ id: "actor-a", display_name: "Alice", },),
      ],
    },);

    expect(characters.map((c,) => c.displayName),).toEqual(["Zed", "Alice",],);
  });

  test("keeps raw unescaped text so the JSON branch carries real values", () => {
    const { characters, } = buildCharactersGridViewModel({
      actors: [actor({ display_name: "<b>Evil</b>", description: "<script>x</script>", },),],
    },);

    expect(characters[0]?.displayName,).toBe("<b>Evil</b>",);
    expect(characters[0]?.description,).toBe("<script>x</script>",);
  });
});

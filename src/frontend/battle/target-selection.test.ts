import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { installBattleDom, } from "../tests/battle-fake-dom";
import { renderTargetSelector, } from "./target-selection";

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

describe("renderTargetSelector", () => {
  it("renders targets and selection", () => {
    const el = renderTargetSelector(
      [{ id: "a", name: "Alice", }, { id: "b", name: "Bob", disabled: true, },],
      "a",
      () => {},
    );

    expect(el.children,).toHaveLength(2,);
    expect(el.children[0]!.classList.contains("is-selected",),).toBe(true,);

    expect((el.children[1] as HTMLButtonElement).disabled,).toBe(true,);
  });
});

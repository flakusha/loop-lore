// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { clearFocusLog, type FakeEl, installBattleDom, } from "../tests/battle-fake-dom";
import { fetchLocationConfig, renderPrivateSpace, toPrivateSpaceView, } from "./private-space";

beforeEach(() => {
  installBattleDom();
},);

afterEach(() => {
  clearFocusLog();
},);

describe("toPrivateSpaceView", () => {
  it("marks private venues suitable", () => {
    const view = toPrivateSpaceView("loc-1", { locationType: "bedroom", privacyLevel: "private", },);
    expect(view.suitable,).toBe(true,);
    expect(view.locationType,).toBe("bedroom",);
  });

  it("marks public venues unsuitable", () => {
    const view = toPrivateSpaceView("loc-1", { locationType: "tavern", privacyLevel: "public", },);
    expect(view.suitable,).toBe(false,);
  });

  it("treats an unknown tier as public", () => {
    const view = toPrivateSpaceView("loc-1", {},);
    expect(view.suitable,).toBe(false,);
    expect(view.privacyLevel,).toBe("public",);
  });
});

describe("renderPrivateSpace", () => {
  it("renders nothing without a view", () => {
    expect(renderPrivateSpace(null,),).toBeNull();
  });

  it("renders the verdict and kind testids", () => {
    const section = renderPrivateSpace(
      toPrivateSpaceView("loc-1", { locationType: "bedroom", privacyLevel: "private", },),
    ) as unknown as FakeEl;

    expect(section.dataset["testid"],).toBe("nsfw-private-space",);
    expect(
      section.children.filter((el,) => el.dataset["testid"] === "nsfw-private-space-verdict"),
    ).toHaveLength(1,);

    expect(
      section.children.filter((el,) => el.dataset["testid"] === "nsfw-private-space-kind"),
    ).toHaveLength(1,);
  });
});

describe("fetchLocationConfig — consent gate", () => {
  it("maps 403 to denied so the panel stays hidden", async () => {
    const denied = await fetchLocationConfig(
      "loc-1",
      async () => new Response(JSON.stringify({ error: "denied", },), { status: 403, },),
    );

    expect(denied,).toEqual({ status: "denied", },);
  });

  it("maps other failures to failed so only the section stays empty", async () => {
    const failed = await fetchLocationConfig("loc-1", async () => new Response("nope", { status: 500, },),);
    expect(failed,).toEqual({ status: "failed", },);
  });

  it("returns the config row on ok", async () => {
    const ok = await fetchLocationConfig(
      "loc-1",
      async () => Response.json({ locationId: "loc-1", privacyLevel: "private", },),
    );

    expect(ok,).toEqual({ status: "ok", data: { locationId: "loc-1", privacyLevel: "private", }, },);
  });
});

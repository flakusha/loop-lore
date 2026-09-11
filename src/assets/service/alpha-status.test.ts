// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the asset alpha state machine.
 *
 * Unknown/native are terminal (never need matting); raw enters the queue
 * once; matted/failed may re-enter pending on re-run with a newer model.
 */
import { describe, expect, test, } from "bun:test";
import { AssetAlphaStatus, } from "../../db/enums";
import { canTransitionAlphaStatus, initialAlphaStatus, } from "./alpha-status";

describe("initialAlphaStatus", () => {
  test("non-images are unknown", () => {
    expect(initialAlphaStatus("video/mp4", false,),).toBe(AssetAlphaStatus.Unknown,);
    expect(initialAlphaStatus("video/mp4", true,),).toBe(AssetAlphaStatus.Unknown,);
  });

  test("images split on header-detected alpha", () => {
    expect(initialAlphaStatus("image/png", true,),).toBe(AssetAlphaStatus.Native,);
    expect(initialAlphaStatus("image/png", false,),).toBe(AssetAlphaStatus.Raw,);
  });
});

describe("canTransitionAlphaStatus", () => {
  test("raw enters the queue exactly once", () => {
    expect(canTransitionAlphaStatus(AssetAlphaStatus.Raw, AssetAlphaStatus.MattingPending,),).toBe(
      true,
    );
    expect(canTransitionAlphaStatus(AssetAlphaStatus.Raw, AssetAlphaStatus.Matted,),).toBe(false,);
  });

  test("pending resolves to matted or failed", () => {
    expect(canTransitionAlphaStatus(AssetAlphaStatus.MattingPending, AssetAlphaStatus.Matted,),).toBe(
      true,
    );
    expect(
      canTransitionAlphaStatus(AssetAlphaStatus.MattingPending, AssetAlphaStatus.MattingFailed,),
    ).toBe(true,);
    expect(canTransitionAlphaStatus(AssetAlphaStatus.MattingPending, AssetAlphaStatus.Raw,),).toBe(
      false,
    );
  });

  test("matted and failed re-enter pending on re-run", () => {
    expect(canTransitionAlphaStatus(AssetAlphaStatus.Matted, AssetAlphaStatus.MattingPending,),).toBe(
      true,
    );
    expect(
      canTransitionAlphaStatus(AssetAlphaStatus.MattingFailed, AssetAlphaStatus.MattingPending,),
    ).toBe(true,);
    expect(canTransitionAlphaStatus(AssetAlphaStatus.Matted, AssetAlphaStatus.Matted,),).toBe(false,);
  });

  test("unknown and native are terminal", () => {
    for (const target of Object.values(AssetAlphaStatus,)) {
      expect(canTransitionAlphaStatus(AssetAlphaStatus.Unknown, target,),).toBe(false,);
      expect(canTransitionAlphaStatus(AssetAlphaStatus.Native, target,),).toBe(false,);
    }
  });
});

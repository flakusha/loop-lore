import { describe, expect, test, } from "bun:test";

import { MessageStatus, MessageVisibility, } from "../enums";
import { ShadowNoteStatus, ShadowNoteVisibility, } from "../enums-gm";
import { assertValidWrite, } from "./enforce";

describe("assertValidWrite — messages", () => {
  test("accepts a legal status x visibility pair", () => {
    expect(() => {
      assertValidWrite("messages", {
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.HiddenByUser,
      },);
    },).not.toThrow();
  });

  test("rejects sending:hidden_by_user — a non-terminal message must stay visible", () => {
    expect(() => {
      assertValidWrite("messages", {
        status: MessageStatus.Sending,
        visibility: MessageVisibility.HiddenByUser,
      },);
    },).toThrow(/not a legal state pair/,);
  });

  test("accepts the legacy 'visible' status default", () => {
    // messages.status is NOT NULL DEFAULT 'visible' (001_init.ts:1864) and 'visible'
    // is a MessageVisibility value, never a MessageStatus. updateMessageVisibility
    // merges this persisted status on default-inserted rows (the profanity gate), so
    // exactly this one literal must not block a visibility write.
    expect(() => {
      assertValidWrite("messages", { status: "visible", visibility: "hidden_by_moderator", },);
    },).not.toThrow();
  });

  test("rejects any status that is neither a MessageStatus nor the legacy default", () => {
    // The exemption above is one value wide. Everything else fails closed instead of
    // riding into the DB unvalidated.
    for (const bogus of ["", "CONFIRMED", "Sending", "totally_bogus", "null",]) {
      expect(() => {
        assertValidWrite("messages", { status: bogus, visibility: MessageVisibility.Visible, },);
      },).toThrow(/is not a MessageStatus/,);
    }
  });

  test("the legacy exemption does not disable the visibility axis", () => {
    // Regression: the exemption used to `return` before `visibility` was even
    // read, so `{ status: "visible", visibility: <anything> }` passed the guard
    // wholesale — a typo in the second axis rode in unchecked behind the first.
    // The exemption is scoped to the PAIR check only; each axis is still
    // validated against its own enum.
    expect(() => {
      assertValidWrite("messages", { status: "visible", visibility: "hidden_by_moderatr", },);
    },).toThrow(/messages\.visibility .* is not a MessageVisibility/,);
  });

  test("rejects a partial write that omits the counterpart axis", () => {
    expect(() => {
      assertValidWrite("messages", { visibility: MessageVisibility.Visible, },);
    },).toThrow(/messages\.status must be a string/,);
  });
});

describe("assertValidWrite — shadow_notes", () => {
  test("accepts revealed:user_visible", () => {
    expect(() => {
      assertValidWrite("shadow_notes", {
        status: ShadowNoteStatus.Revealed,
        visibility: ShadowNoteVisibility.UserVisible,
      },);
    },).not.toThrow();
  });

  test("rejects revealed:hidden — the leak pair the composite exists to block", () => {
    expect(() => {
      assertValidWrite("shadow_notes", {
        status: ShadowNoteStatus.Revealed,
        visibility: ShadowNoteVisibility.Hidden,
      },);
    },).toThrow(/not a legal state pair/,);
  });

  test("accepts hidden:hidden — hidden notes are GM-only before reveal", () => {
    expect(() => {
      assertValidWrite("shadow_notes", {
        status: ShadowNoteStatus.Hidden,
        visibility: ShadowNoteVisibility.Hidden,
      },);
    },).not.toThrow();
  });
});

describe("assertValidWrite — character_licensing", () => {
  test("accepts share_alike when derivatives are allowed", () => {
    expect(() => {
      assertValidWrite("character_licensing", {
        allow_derivatives: 1,
        share_alike: 1,
      },);
    },).not.toThrow();
  });

  test("rejects the forbidden:yes drift pair", () => {
    expect(() => {
      assertValidWrite("character_licensing", {
        allow_derivatives: 0,
        share_alike: 1,
      },);
    },).toThrow(/not a legal state pair/,);
  });

  test("rejects a non 0/1 rights flag instead of coercing it", () => {
    expect(() => {
      assertValidWrite("character_licensing", { allow_derivatives: 2, share_alike: 0, },);
    },).toThrow(/allow_derivatives must be 0 or 1/,);
  });
});

describe("assertValidWrite — unguarded tables", () => {
  test("is a no-op for a table with no state-machine invariant", () => {
    expect(() => {
      assertValidWrite("chat_branches", { is_active: 1, },);
    },).not.toThrow();
  });
});

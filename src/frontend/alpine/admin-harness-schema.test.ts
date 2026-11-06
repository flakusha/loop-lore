// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin harness permission schema contracts: the parked-ask payload,
 * the permissions list body, and the decision body must accept exactly
 * what the routes emit and reject obvious shape violations.
 *
 * Resource contract (parallel-safe): pure in-memory TypeBox validation —
 * no DOM, no DB, no ports, no shared globals, order-independent.
 */
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, it, } from "bun:test";
import {
  HarnessAvailabilitySchema,
  HarnessPendingPermissionSchema,
  HarnessPermissionDecisionResponse,
  HarnessPermissionsResponse,
} from "./admin-harness-schema";

/** A well-formed parked ask, as produced by the permission queue. */
const validPending = {
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  profile: "p",
  tool: "edit",
  input: { sessionId: "s", kind: "edit", },
  cwd: "/tmp/sandbox",
  arrival: 1_760_000_000_000,
};

describe("admin harness permission schemas", () => {
  it("HarnessPendingPermissionSchema accepts a queued ask (null tool allowed)", () => {
    expect(Value.Check(HarnessPendingPermissionSchema, validPending,),).toBe(true,);
    expect(Value.Check(HarnessPendingPermissionSchema, { ...validPending, tool: null, },),).toBe(true,);
  });

  it("HarnessPendingPermissionSchema rejects missing or mistyped fields", () => {
    expect(Value.Check(HarnessPendingPermissionSchema, { ...validPending, id: 7, },),).toBe(false,);
    const { arrival, ...withoutArrival } = validPending;
    expect(Value.Check(HarnessPendingPermissionSchema, withoutArrival,),).toBe(false,);
  });

  it("HarnessPermissionsResponse wraps the pending-ask array", () => {
    expect(Value.Check(HarnessPermissionsResponse, { items: [validPending,], },),).toBe(true,);
    expect(Value.Check(HarnessPermissionsResponse, { items: [], },),).toBe(true,);
    expect(Value.Check(HarnessPermissionsResponse, { items: [validPending, 3,], },),).toBe(false,);
    expect(Value.Check(HarnessPermissionsResponse, {},),).toBe(false,);
  });

  it("HarnessAvailabilitySchema accepts both verdict arms and rejects shape violations", () => {
    expect(Value.Check(HarnessAvailabilitySchema, { available: true, version: "opencode 9.9.9", },),).toBe(true,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: true, version: null, },),).toBe(true,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: false, reason: "nope", },),).toBe(true,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: true, },),).toBe(false,);
    expect(Value.Check(HarnessAvailabilitySchema, { available: false, },),).toBe(false,);
  });

  it("HarnessPermissionDecisionResponse accepts only { ok: boolean }", () => {
    expect(Value.Check(HarnessPermissionDecisionResponse, { ok: true, },),).toBe(true,);
    expect(Value.Check(HarnessPermissionDecisionResponse, { ok: false, },),).toBe(true,);
    expect(Value.Check(HarnessPermissionDecisionResponse, { ok: "yes", },),).toBe(false,);
  });
});

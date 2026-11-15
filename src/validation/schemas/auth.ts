// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Login route validation schema.
 */

import { t, } from "elysia";

// ── Login ──────────────────────────────────────────────────

export const LoginBody = t.Object({
  username: t.String({ minLength: 1, },),
  password: t.String({ minLength: 1, },),
},);

// ── MFA factor issue ─────────────────────────────────────────

export const IssueChallengeBody = t.Object({
  factorId: t.String({ minLength: 1, },),
  channel: t.Union([
    t.Literal("email",),
    t.Literal("messenger",),
  ],),
  destination: t.String({ minLength: 1, maxLength: 320, },),
  purpose: t.Union([
    t.Literal("login",),
    t.Literal("stepup",),
    t.Literal("enroll",),
    t.Literal("address-change",),
    t.Literal("unlock",),
  ],),
},);

// ── MFA factor verify ────────────────────────────────────────

export const VerifyFactorBody = t.Object({
  challengeId: t.String({ minLength: 1, },),
  code: t.String({ minLength: 1, },),
  purpose: t.Union([
    t.Literal("login",),
    t.Literal("stepup",),
    t.Literal("enroll",),
    t.Literal("address-change",),
    t.Literal("unlock",),
  ],),
},);

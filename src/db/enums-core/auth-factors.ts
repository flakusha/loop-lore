// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auth factor enums (epic-auth-channel-provisioning F1).
 *
 * FactorKind is the cross-epic vocabulary of factor kinds; ChallengePurpose
 * is why a challenge was issued. Both are stored as TEXT columns and typed
 * through COLUMN_TYPE_OVERRIDES.
 */

// ── Factor kind ─────────────────────────────────────────
export const FactorKind = {
  MessengerMatrix: "messenger-matrix",
  MessengerIm: "messenger-im",
  Email: "email",
  FederatedOidc: "federated-oidc",
} as const;
/** */
export type FactorKind = (typeof FactorKind)[keyof typeof FactorKind];

// ── Challenge purpose ────────────────────────────────────
export const ChallengePurpose = {
  Login: "login",
  StepUp: "stepup",
  Enroll: "enroll",
  AddressChange: "address-change",
  Unlock: "unlock",
} as const;
/** */
export type ChallengePurpose = (typeof ChallengePurpose)[keyof typeof ChallengePurpose];

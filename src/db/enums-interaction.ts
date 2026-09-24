// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export const InteractionCategory = {
  Survival: "survival",
  Social: "social",
  Economy: "economy",
  Stealth: "stealth",
  Intellect: "intellect",
  Combat: "combat",
} as const;

export type InteractionCategory = (typeof InteractionCategory)[keyof typeof InteractionCategory];

export const InteractionOutcome = {
  Success: "success",
  Failure: "failure",
  CriticalSuccess: "critical_success",
  CriticalFailure: "critical_failure",
  Blocked: "blocked",
} as const;

export type InteractionOutcome = (typeof InteractionOutcome)[keyof typeof InteractionOutcome];

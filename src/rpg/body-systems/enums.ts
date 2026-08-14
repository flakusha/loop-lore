/**
 * Body Systems Enums
 *
 * Open-ended domain unions consolidated into const-object enums so call sites
 * stop leaking magic string literals.
 */

/**
 * Species sentinel. `species` is an open string field (any species allowed),
 * so only the well-known "human" sentinel is consolidated here.
 */
export const Species = { Human: "human" } as const;
export type Species = (typeof Species)[keyof typeof Species];

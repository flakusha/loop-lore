// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Shared test-only type helpers. */
export type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;

export interface Toast {
  type: string;
  message: string;
}

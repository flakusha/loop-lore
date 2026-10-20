// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export interface GoldenQuery {
  id: string;
  query: string;
  expectedDocIds: string[];
  expectedChunkIds?: string[];
  relevanceGrades?: Record<string, number>;
  tags: string[];
  notes?: string;
}

export interface GoldenSuite {
  name: string;
  queries: GoldenQuery[];
}

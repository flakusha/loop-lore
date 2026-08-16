// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration Registry — Mermaid renderer
 *
 * Runtime graph export for docs generation, CI, or an admin dashboard.
 * Migrated verbatim from the former `renderIntegrationMermaid()`.
 */
import { PLAYER_STATE_LAYERS, } from "./player-state-layers";

/**
 * Runtime Mermaid graph export. Call to generate a diagram.
 * Use in docs gen, CI, or admin dashboard.
 */
export function renderIntegrationMermaid(): string {
  const owners = [...new Set(Array.from(PLAYER_STATE_LAYERS, (l,) => l.owner,),),];

  const ownerEdges = Array.from(
    PLAYER_STATE_LAYERS,
    (l,) => `'${l.owner}' -->|'${l.id} layer (${l.classification})'|('${l.id}'),`,
  ).join("\n",);

  const producerEdgesParts: string[] = [];
  for (const l of PLAYER_STATE_LAYERS) {
    for (const p of l.producers) {
      if (p !== l.owner) { producerEdgesParts.push(`'${p}' -.->|'produces ${l.id}'|('${l.id}'),`,); }
    }
  }
  const producerEdges = producerEdgesParts.join("\n",);

  const ownerNodes = Array.from(owners, (o,) => `'${o}',`,).join("\n",);
  return `flowchart LR\n${ownerNodes}\n${ownerEdges}\n${producerEdges}`;
}

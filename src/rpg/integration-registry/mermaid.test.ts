// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the integration-registry Mermaid renderer. */
import { describe, expect, test, } from "bun:test";
import { renderIntegrationMermaid, } from "./mermaid";
import { PLAYER_STATE_LAYERS, } from "./player-state-layers";

describe("renderIntegrationMermaid", () => {
  test("emits a flowchart with an owner edge per layer", () => {
    const out = renderIntegrationMermaid();
    expect(out.startsWith("flowchart LR",),).toBe(true,);
    for (const layer of PLAYER_STATE_LAYERS) {
      expect(out,).toContain(`'${layer.owner}' -->|'${layer.id} layer (${layer.classification})'`,);
    }
  });

  test("emits producer edges only for non-owner producers", () => {
    const out = renderIntegrationMermaid();
    for (const layer of PLAYER_STATE_LAYERS) {
      for (const producer of layer.producers) {
        if (producer === layer.owner) {
          continue;
        }
        expect(out,).toContain(`'${producer}' -.->|'produces ${layer.id}'`,);
      }
    }
  });
});

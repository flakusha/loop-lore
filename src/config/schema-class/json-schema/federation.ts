// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/federation.ts — federation JSON Schema section

export const federation = {
  type: "object",
  description:
    "Federation/mesh interconnect opt-in. Disabled by default; an instance must explicitly opt in and list seeds before it advertises or connects.",
  properties: {
    enabled: {
      type: "boolean",
      default: false,
      description: "Enable federation/mesh interconnect.",
    },
    seeds: {
      type: "array",
      default: [],
      description: "Peer origins to bootstrap discovery from.",
      items: { type: "string", },
    },
    peers: {
      type: "array",
      default: [],
      description: "Per-peer endpoint + trust overrides.",
      items: {
        type: "object",
        properties: {
          origin: { type: "string", },
          trust: {
            type: "object",
            properties: {
              caBundle: { type: "string", },
              spkiPins: { type: "array", items: { type: "string", }, },
            },
          },
        },
        required: ["origin",],
      },
    },
    meshPsk: {
      type: "string",
      default: "",
      description: "Mesh content PSK for envelope seal/open. Env-only: MESH_PSK.",
    },
    duplication: {
      type: "object",
      default: { mode: "trusted", peers: [], },
      description: "Duplication policy for pushed content, with optional per-world overrides.",
      properties: {
        mode: { type: "string", enum: ["trusted", "listed", "none",], },
        peers: { type: "array", default: [], items: { type: "string", }, },
        worlds: {
          type: "object",
          default: {},
          description: "Per-world overrides keyed by world id.",
          additionalProperties: {
            type: "object",
            properties: {
              mode: { type: "string", enum: ["trusted", "listed", "none",], },
              peers: { type: "array", default: [], items: { type: "string", }, },
            },
            required: ["mode", "peers",],
          },
        },
      },
      required: ["mode", "peers",],
    },
  },
  required: ["enabled", "seeds", "peers", "meshPsk", "duplication",],
};

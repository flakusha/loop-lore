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
  },
  required: ["enabled", "seeds", "peers",],
};

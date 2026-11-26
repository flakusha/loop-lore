// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Features JSON Schema section.
import { FEATURE_PROFILES, } from "../../schema/features";

export const features = {
  type: "object",
  description: "Feature profile: a gating lens over shipped features, never a config rewriter. Default `full`.",
  properties: {
    profile: {
      type: "string",
      enum: FEATURE_PROFILES,
      default: "full",
      description: "Feature profile to gate surfaces; an explicit unknown value fails boot.",
    },
  },
};

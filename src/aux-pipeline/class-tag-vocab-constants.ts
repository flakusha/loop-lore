// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared constants for the classifier tag vocabulary.
 *
 * This module is browser-safe on purpose: the admin frontend card imports it,
 * so it must not pull server modules (config access, DB) into the browser
 * bundle — `node:zlib` and friends break `bun build --target browser`.
 */

/** system_config key holding the admin-curated tag vocabulary (JSON string[]). */
export const CLASSIFIER_TAG_VOCABULARY_KEY = "classifier_tag_vocabulary";

/** system_config key prefix for the per-chat active tag subset (JSON string[]). */
export const CLASSIFIER_TAGS_ACTIVE_PREFIX = "classifier_tags_active:";

/** Maximum characters in a single tag. */
export const MAX_TAG_LENGTH = 64;

/** Maximum number of tags in the curated vocabulary. */
export const MAX_VOCABULARY_TAGS = 200;

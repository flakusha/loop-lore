// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Commit Message and Semver Regex Patterns
 *
 * Patterns for parsing conventional commit messages and semantic version strings.
 *
 * Sources: src/scripts/commit-check.ts, src/scripts/version-bump.ts
 */

/** Parse conventional commit messages: type(scope)?: subject */
export const CONVENTIONAL_COMMIT = /^(\w+)(?:\(([^)]+)\))?(!)?:\s(.+)$/;

/** Parse semver version strings: major.minor.patch[-prerelease] */
export const SEMVER = /(\d+)\.(\d+)\.(\d+)(?:-(.+))?/;

/** Match release branch names: release/123 */
export const RELEASE_BRANCH = /^release\/(\d+)/;

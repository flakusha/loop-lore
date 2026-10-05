// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Legacy version redirect middleware.
 *
 * Redirects unversioned `/api/{resource}` requests to `/api/v1/{resource}`
 * for backward compatibility during the versioning migration.
 * @param targetVersion
 * @see docs/spec/api-versioning.md
 */
export function versionRedirect(targetVersion: string,) {
  return (ctx: { request: Request },) => {
    const url = new URL(ctx.request.url,);
    // Slice off "/api/" (5 chars) and prepend versioned prefix
    const newPath = `/api/${targetVersion}/${url.pathname.slice(5,)}`;
    const newUrl = `${newPath}${url.search}`;

    return new Response(null, {
      status: 308,
      headers: {
        Location: newUrl,
        "X-API-Version": targetVersion,
      },
    },);
  };
}

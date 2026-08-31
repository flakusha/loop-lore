// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Legacy version redirect middleware.
 *
 * Redirects unversioned `/api/{resource}` requests to `/api/v1/{resource}`
 * for backward compatibility during the versioning migration.
 * @see docs/spec/api-versioning.md
 */

/**
 * Create a redirect handler that sends 308 Permanent Redirect from
 * `/api/{path}` to `/api/v1/{path}`, preserving method and body.
 * @param targetVersion
 * @example
 * app.all("/api/:resource", versionRedirect("v1",));
 * app.all("/api/:resource/*", versionRedirect("v1",));
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

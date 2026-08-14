/**
 * Legacy version redirect middleware.
 *
 * Redirects unversioned `/api/{resource}` requests to `/api/v1/{resource}`
 * for backward compatibility during the versioning migration.
 *
 * @see docs/spec/api-versioning.md
 */


/**
 * Create a redirect handler that sends 308 Permanent Redirect from
 * `/api/{path}` to `/api/v1/{path}`, preserving method and body.
 *
 * @example
 * app.all("/api/:resource", versionRedirect("v1",));
 * app.all("/api/:resource/*", versionRedirect("v1",));
 */
export function versionRedirect(targetVersion: string,) {
  return (ctx: { request: Request },) => {
    const url = new URL(ctx.request.url,);
    const newPath = url.pathname.replace(/^\/api\//, `/api/${targetVersion}/`,);
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

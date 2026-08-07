// src/routes/world-import.ts
//
// World/location/story import route.
// Consumes the canonical WorldBundle produced by the story export
// (src/routes/export-shared.ts `exportStoryToZip`) and re-inserts a fresh
// world owned by the importing user, remapping identifiers so the bundle
// round-trips.

export { importWorldBundle, } from "./bundle";
export { worldImportRoutes, } from "./routes";

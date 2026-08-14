/**
 * Crafting Routes — barrel export.
 *
 * Exposes crafting HTTP endpoints. Currently recipe CRUD; station,
 * attempt, and order routes land with their services (see
 * src/rpg/crafting index TODO comments).
 */
export { craftingRecipeRoutes, } from "./recipes";

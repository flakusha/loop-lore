// Auth guard moved inline to elysia-app.ts for proper context propagation.
// Each plugin's derive doesn't propagate to child .use() routes.
export const authGuard = null;
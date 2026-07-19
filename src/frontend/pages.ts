/**
 * Page-specific behaviors entry point.
 * Loaded as a separate bundle from app.js — keeps core framework small.
 */
// loaders.d.ts provides ambient global types via tsconfig include — no runtime import needed
import "./pages/characters";
import "./pages/gallery";
import "./pages/worlds";
import "./pages/new-chat";
import "./pages/quests";

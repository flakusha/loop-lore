/**
 * Alpine.js Components — Modular Entry
 *
 * Re-exports all page components and htmx handlers.
 * Bun build compiles this into dist/public/ as split chunks.
 */

 // required for declare global in module

// Types + shared infrastructure first
import "./types";
import "./theme";
import "./i18n";
import "./app";

// Page components
import "./chat";
import "./gallery";
import "./settings";
import "./new-chat";
import "./worlds";
import "./characters";

// Event handlers (applied globally)
import "./htmx";

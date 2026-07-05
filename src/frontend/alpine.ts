/**
 * Alpine.js Components — Entry Point
 *
 * Combines all page components + htmx handlers into single bundle.
 * Bun compiles into dist/public/alpine.js.
 */

 // required for declare global in module

// Types + shared infrastructure first
import "./alpine/types";
import "./alpine/theme";
import "./alpine/i18n";
import "./alpine/app";

// Page components
import "./alpine/chat";
import "./alpine/gallery";
import "./alpine/settings";
import "./alpine/new-chat";
import "./alpine/worlds";
import "./alpine/characters";

// Event handlers (applied globally)
import "./alpine/htmx";
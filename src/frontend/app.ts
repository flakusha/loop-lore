/**
 * App entry — single bundle combining all core modules.
 * Single file avoids cross-bundle minified name conflicts (var e / class e).
 */
import "./alpine/types";
import "./alpine/theme";
import "./alpine/i18n";
import "./alpine/app";
import "./alpine/htmx";
import "./alpine/world-edit";
import "./alpine/chat";
import "./ui";
import "./page-loaders";
import "./gallery-upload";

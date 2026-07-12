/**
 * App entry — core framework bundle (sidebar, toast, theme, locale, htmx).
 * Page-specific behaviors are in pages.ts (separate bundle).
 */
import "./alpine/types";
import "./alpine/theme";
import "./alpine/i18n";
import "./alpine/app";
import "./alpine/htmx";
import "./alpine/world-edit";
import "./alpine/chat";
import "./ui";
import "./gallery-upload";

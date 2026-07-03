# Vite-based Documentation System Proposal

## Overview

This document proposes implementing a Vite-based documentation system for loop-lore to replace the current static markdown serving approach. This will provide enhanced documentation features including theming, search, navigation, and better developer experience while maintaining the project's lightweight philosophy.

## Current State

Currently, loop-lore serves documentation through:

- Static markdown files in the `docs/` directory
- Basic static file serving via Bun's HTTP server
- No built-in search, theming, or navigation features
- Limited customization options

## Proposed Solution: VitePress

[VitePress](https://vitepress.vuejs.org/) is a minimalistic Vite-powered static site generator perfect for documentation. It offers:

- Zero-config startup (works out of the box with markdown)
- Built-in theming with light/dark modes
- Algolia/DocSearch integration for search
- Custom theme support
- Hot Module Replacement during development
- Optimized production builds
- Vue-powered interactive components when needed
- Perfect integration with Vite ecosystem

## Implementation Plan

### 1. Installation

```bash
bun add -d vitepress
```

### 2. Directory Structure

```
docs/
├── .vitepress/
│   ├── config.mts          # VitePress configuration
│   ├── theme/
│   │   └── index.ts       # Custom theme extension
│   ├── public/            # Static assets
│   └── index.md           # Homepage
├── guide/
│   ├── getting-started.md
│   ├── installation.md
│   ├── architecture.md
│   ├── frontend.md
│   ├── tui.md
│   ├── assets.md
│   └── assistant.md
├── reference/
│   ├── api.md
│   ├── schema.md
│   ├── auth.md
│   ├── users-sessions.md
│   ├── messages.md
│   └── assets.md
├── api-reference/
├── index.md
└── vite-docs-proposal.md
```

### 3. Development Workflow

1. **Development**: `bun run docs:dev` starts VitePress dev server at http://localhost:5173
2. **Preview**: `bun run docs:preview` previews the production build
3. **Build**: `bun run docs:build` generates static files to `docs/.vitepress/dist`
4. **Integration**: The Bun server serves the built documentation from `/docs/`

### 4. Customization Options

#### Custom Styles

Override VitePress variables in `.vitepress/theme/styles/vars.css`:

```css
:root {
  --vp-c-brand: #164e63;
  --vp-c-brand-light: #5fb3a3;
  --vp-c-brand-lighter: #a8e6cf;
  --vp-c-brand-dark: #0d3546;
  --vp-c-brand-darker: #071f2d;
}
```

#### Custom Theme

Create `.vitepress/theme/index.ts` to extend or customize the default theme.

### 5. Benefits

#### For Developers

- Hot module replacement during documentation writing
- Built-in search with minimal configuration
- Easy theming and customization
- TypeScript support in configuration

#### For Users

- Fast, responsive documentation site
- Dark/light theme toggle
- Excellent search functionality
- Mobile-responsive design
- Print-friendly styles
- Accessible by default (WCAG compliant)

### 6. Migration Plan

1. **Phase 1**: Set up VitePress alongside existing docs
2. **Phase 2**: Migrate existing markdown files to VitePress structure
3. **Phase 3**: Add custom components and theming
4. **Phase 4**: Integrate with Bun server for production serving
5. **Phase 5**: Remove old static serving code
6. **Phase 6**: Add advanced features (API auto-generation, search customization)

### 7. Integration with Bun Server

Modify `src/server.ts` to serve the built documentation:

```typescript
import { serve } from "bun";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const DOCS_PATH = join(import.meta.dir, "..", "docs", ".vitepress", "dist");

const server = serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/docs/")) {
      let filePath = url.pathname.substring(5);
      if (filePath === "" || filePath.endsWith("/")) filePath += "index.html";
      const fullPath = join(DOCS_PATH, filePath);
      if (existsSync(fullPath)) {
        return new Response(readFileSync(fullPath), {
          headers: { "Content-Type": getContentType(filePath) },
        });
      }
      return new Response("Documentation not found", { status: 404 });
    }
    return new Response("Hello from Loop Lore!");
  },
});
```

### 8. Maintenance and Updates

#### Updating VitePress

```bash
bun update -d vitepress
```

#### Adding New Documentation

1. Create new markdown file in appropriate directory
2. Add to sidebar configuration in `.vitepress/config.mts`
3. Restart dev server if needed

## Configuration

Key environment variables:

| Variable      | Description                   | Default |
| ------------- | ----------------------------- | ------- |
| DOCS_ENABLED  | Enable/disable docs serving   | true    |
| DOCS_DEV_PORT | Documentation dev server port | 5173    |

## Package.json Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

## Troubleshooting

### ESM Module Issues

If you encounter `"vitepress" resolved to an ESM file` errors when using Bun, try:

1. Use `.mts` extension for config files (as shown above)
2. Remove extraneous `.js`/`.ts` config files from `.vitepress/`
3. Set `"type": "module"` in package.json

### Dead Link Warnings

Add `ignoreDeadLinks: true` to the VitePress config to bypass unlinkable references during migration.

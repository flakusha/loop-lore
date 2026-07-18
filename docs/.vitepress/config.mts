import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Loop Lore',
  description: 'A lightweight RPG chat application reimagining SillyTavern',
  base: '/docs/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/docs/favicon.svg' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
    },
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'Specs', link: '/spec/architecture', activeMatch: '/spec/' },
      { text: 'Frontend', link: '/frontend/overview', activeMatch: '/frontend/' },
      { text: 'Reference', link: '/reference/api', activeMatch: '/reference/' },
      { text: 'Roadmap', link: '/meta/roadmap' },

      { text: 'Ideas', link: '/ideas/', activeMatch: '/ideas/' },
      { text: 'GitHub', link: 'https://github.com/yourusername/loop-lore' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
          ],
        },
        {
          text: 'Characters & RPG',
          collapsed: false,
          items: [
            { text: 'Creating Characters', link: '/guide/characters' },
          ],
        },
      ],

      '/spec/': [
        {
          text: 'Architecture',
          collapsed: false,
          items: [
            { text: 'Architecture Overview', link: '/spec/architecture' },
            { text: 'Implementation Details', link: '/spec/implementation' },
            { text: 'Build & Deploy', link: '/spec/build-deploy' },
          ],
        },
        {
          text: 'Core Systems',
          collapsed: false,
          items: [
            { text: 'Database Schema', link: '/spec/schema' },
            { text: 'Messages', link: '/spec/messages' },
            { text: 'Users & Sessions', link: '/spec/users-sessions' },
            { text: 'Assets', link: '/spec/assets' },
            { text: 'Asset Attribution', link: '/spec/assets-attribution' },
          ],
        },
        {
          text: 'Characters & RPG',
          collapsed: false,
          items: [
            { text: 'Actor Data Model', link: '/spec/actors' },
            { text: 'Character & Persona Setup', link: '/spec/character-setup' },
            { text: 'RPG Mechanics', link: '/spec/rpg-mechanics' },
            { text: 'Memory System', link: '/spec/memory-system' },
          ],
        },
        {
          text: 'Story & World',
          collapsed: false,
          items: [
            { text: 'Multi-LLM Story', link: '/frontend/chat/multi-llm-story' },
          ],
        },
        {
          text: 'Interfaces',
          collapsed: false,
          items: [
            { text: 'TUI Mode', link: '/spec/tui' },
            { text: 'Transport Layer', link: '/spec/transport-unified' },
          ],
        },
        {
          text: 'Infrastructure',
          collapsed: true,
          items: [
            { text: 'Plugin System', link: '/spec/plugin-system' },
            { text: 'Artifacts System', link: '/spec/artifacts-system' },
            { text: 'Logging', link: '/spec/logging' },
            { text: 'Testing', link: '/spec/testing' },
          ],
        },
        {
          text: 'Integrations',
          collapsed: true,
          items: [
            { text: 'llama.cpp', link: '/spec/integrations/llama-cpp' },
            { text: 'stable-diffusion.cpp', link: '/spec/integrations/stable-diffusion-cpp' },
          ],
        },
        {
          text: 'Use Cases',
          collapsed: true,
          items: [
            { text: 'Agentic Workspace', link: '/spec/use-case-agentic-workspace' },
          ],
        },
      ],

      '/frontend/': [
        {
          text: 'Design System',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/frontend/overview' },
            { text: 'Routing', link: '/frontend/routing' },
            { text: 'Components', link: '/frontend/components' },
            { text: 'Data States', link: '/frontend/data-states' },
            { text: 'Internationalization', link: '/frontend/internationalization' },
            { text: 'Encryption', link: '/frontend/encryption' },
          ],
        },
        {
          text: 'Chat System',
          collapsed: false,
          items: [
            { text: 'Chat Overview', link: '/frontend/chat/overview' },
            { text: 'Layout', link: '/frontend/chat/layout' },
            { text: 'Messages', link: '/frontend/chat/messages' },
            { text: 'Input', link: '/frontend/chat/input' },
            { text: 'Generation', link: '/frontend/chat/generation' },
            { text: 'Archiving', link: '/frontend/chat/archiving' },
            { text: 'Memories', link: '/frontend/chat/memories' },
            { text: 'Commands & Misc', link: '/frontend/chat/commands-and-misc' },
          ],
        },
        {
          text: 'Screens',
          collapsed: false,
          items: [
            { text: 'Login', link: '/frontend/login' },
            { text: 'Characters', link: '/frontend/characters' },
            { text: 'Gallery', link: '/frontend/gallery' },
            { text: 'Settings', link: '/frontend/settings' },
            { text: 'Worlds', link: '/frontend/worlds' },
            { text: 'Age Gate', link: '/frontend/age-gate' },
          ],
        },
      ],

      '/reference/': [
        {
          text: 'API Reference',
          collapsed: false,
          items: [
            { text: 'API Overview', link: '/reference/api' },
          ],
        },
      ],

      '/meta/': [
        {
          text: 'Planning',
          collapsed: false,
          items: [
            { text: 'MVP Plan', link: '/meta/plan' },
            { text: 'Roadmap', link: '/meta/roadmap' },
            { text: 'Migration Strategy', link: '/meta/migration-strategy' },
          ],
        },
        {
          text: 'Reviews',
          collapsed: true,
          items: [
            { text: 'DB Schema Interconnection', link: '/meta/reviews/review-db-schema-interconnection' },
            { text: 'Typecasts Audit', link: '/meta/reviews/review-typecasts' },
            { text: 'Validation Approaches', link: '/meta/reviews/review-validation-approaches' },
          ],
        },
        {
          text: 'Proposals',
          collapsed: true,
          items: [
            { text: 'VitePress Docs', link: '/meta/vite-docs-proposal' },
          ],
        },
      ],

      '/ideas/': [
        {
          text: 'Creative Ideas',
          collapsed: false,
          items: [
            { text: 'Ideas Hub', link: '/ideas/' },
            { text: 'Immersion & Presentation', link: '/ideas/immersion-presentation' },
            { text: 'Prompt & Output Control', link: '/ideas/prompt-output-control' },
            { text: 'Memory, Continuity & Living World', link: '/ideas/memory-continuity' },
            { text: 'Authoring & Creation', link: '/ideas/authoring-creation' },
            { text: 'Social & Multiplayer', link: '/ideas/social-multiplayer' },
            { text: 'Platform & Reach', link: '/ideas/platform-reach' },
            { text: 'Analytics & Meta', link: '/ideas/analytics-meta' },
            { text: '3D Worlds & Navigation', link: '/ideas/worlds-3d-navigation' },
          ],
        },
      ],
    },

    logo: '/logo.svg',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/yourusername/loop-lore' },
    ],

    editLink: {
      pattern: 'https://github.com/yourusername/loop-lore/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    lastUpdated: {
      text: 'Last updated',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium',
      },
    },

    footer: {
      message: 'Released under the AGPL-3.0 License.',
      copyright: 'Copyright © 2024-present Loop Lore Contributors',
    },
  },

  markdown: {
    lineNumbers: true,
  },

  ignoreDeadLinks: true,

  vite: {
    optimizeDeps: {
      exclude: ['@resvg/resvg-js'],
    },
  },
})

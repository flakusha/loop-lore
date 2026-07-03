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
      { text: 'Frontend', link: '/frontend/overview', activeMatch: '/frontend/' },
      { text: 'Reference', link: '/reference/api', activeMatch: '/reference/' },
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'GitHub', link: 'https://github.com/yourusername/loop-lore' },
    ],

    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
          ],
        },
        {
          text: 'Architecture',
          collapsed: false,
          items: [
            { text: 'Architecture Overview', link: '/architecture' },
            { text: 'Implementation Details', link: '/implementation' },
            { text: 'Build & Deploy', link: '/build-deploy' },
          ],
        },
        {
          text: 'Core Systems',
          collapsed: true,
          items: [
            { text: 'Database Schema', link: '/schema' },
            { text: 'Messages', link: '/messages' },
            { text: 'Users & Sessions', link: '/users-sessions' },
            { text: 'Assets', link: '/assets' },
            { text: 'Actors', link: '/actors' },
          ],
        },
        {
          text: 'Interfaces',
          collapsed: false,
          items: [
            { text: 'TUI Mode', link: '/tui' },
            { text: 'Frontend Overview', link: '/frontend/overview' },
            { text: 'Frontend UX Specs', link: '/frontend/routing' },
          ],
        },
        {
          text: 'Resources',
          collapsed: false,
          items: [
            { text: 'Roadmap', link: '/roadmap' },
            { text: 'Asset Credits', link: '/assets-attribution' },
            { text: 'Agentic Workspace', link: '/use-case-agentic-workspace' },
            { text: 'Vite Docs Proposal', link: '/vite-docs-proposal' },
          ],
        },
      ],

      '/frontend/': [
        {
          text: 'Getting Started',
          collapsed: true,
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
          collapsed: true,
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
          collapsed: true,
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
          collapsed: true,
          items: [
            { text: 'API Overview', link: '/reference/api' },
            { text: 'Database Schema', link: '/reference/schema' },
            { text: 'Users & Sessions', link: '/users-sessions' },
            { text: 'Messages', link: '/messages' },
            { text: 'Assets', link: '/assets' },
          ],
        },
        {
          text: 'Core Docs',
          collapsed: false,
          items: [
            { text: 'Architecture', link: '/architecture' },
            { text: 'Implementation', link: '/implementation' },
            { text: 'Build & Deploy', link: '/build-deploy' },
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

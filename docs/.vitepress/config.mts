import { defineConfig } from 'vitepress'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
      { text: 'Ideas', link: '/ideas/', activeMatch: '/ideas/' },
      { text: 'GitHub', link: 'https://github.com/flakusha/loop-lore' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Your First Chat', link: '/guide/first-chat' },
          ],
        },
        {
          text: 'User Guides',
          collapsed: false,
          items: [
            { text: 'Creating Characters', link: '/guide/characters' },
            { text: 'Personas', link: '/guide/personas' },
            { text: 'Worlds', link: '/guide/worlds' },
            { text: 'Gallery', link: '/guide/gallery' },
            { text: 'Settings', link: '/guide/settings' },
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
            { text: 'Regex Extraction', link: '/spec/regex-extraction' },
            { text: 'Profanity Filter', link: '/spec/profanity-filter' },
            { text: 'Scheduler', link: '/spec/scheduler' },
          ],
        },
        {
          text: 'Characters & RPG',
          collapsed: false,
          items: [
            { text: 'Actor Data Model', link: '/spec/actors' },
            { text: 'Character & Persona Setup', link: '/spec/character-spec' },
            { text: 'RPG Mechanics', link: '/spec/rpg-mechanics' },
            { text: 'Memory System', link: '/spec/memory-system' },
            { text: 'Emotion Avatars', link: '/spec/emotion-avatars' },
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
            { text: 'TUI Mode', link: '/spec/terminal-ui' },
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
            { text: 'Image Generation', link: '/spec/integrations/image-generation' },
            { text: 'LLM Serving', link: '/spec/integrations/llm-serving' },
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
            { text: 'Workflow', link: '/meta/workflow' },
          ],
        },
        {
          text: 'Reviews',
          collapsed: true,
          items: [
            { text: 'Alpine + HTMX E2E Feasibility', link: '/meta/reviews/alpine-htmx-e2e-feasibility' },
            { text: 'Alpine + HTMX Integration', link: '/meta/reviews/alpine-htmx-integration' },
            { text: 'FE/BE Compatibility', link: '/meta/reviews/fe-be-compatibility' },
            { text: 'Review Rounds', link: '/meta/reviews/review-rounds' },
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
      { icon: 'github', link: 'https://github.com/flakusha/loop-lore' },
    ],

    editLink: {
      pattern: 'https://github.com/flakusha/loop-lore/edit/main/docs/:path',
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
    // Disable raw HTML parsing so stray `<...>` in docs (command params, type
    // placeholders) are escaped as literal text instead of breaking the Vue
    // template compile. Intentional markup uses standard markdown.
    html: false,
    config(md) {
      // Auto-link git-native-issue extended identifiers (BUG-2025-002, EPIC-2025-14, …)
      // to the generated issue tracker page at /meta/issues/.
      const pattern =
        /(?<![\w/])((?:BUG|FEAT|FEA|FIX|IDEA|TASK|SOL|EPIC|INFRA)-\d{4}-\d{3})(?![\w/-])/g
      md.core.ruler.push('issue_links', (state) => {
        const Token = state.Token
        for (const block of state.tokens) {
          if (block.type !== 'inline' || !block.children) continue
          for (let i = 0; i < block.children.length; i++) {
            const child = block.children[i]
            if (child.type !== 'text') continue
            const text = child.content
            pattern.lastIndex = 0
            if (!pattern.test(text)) continue
            pattern.lastIndex = 0
            const out: InstanceType<typeof Token>[] = []
            let last = 0
            let m: RegExpExecArray | null
            while ((m = pattern.exec(text)) !== null) {
              const extid = m[0]
              const anchor = extid.toLowerCase()
              if (last < m.index) {
                const t = new Token('text', '', 0)
                t.content = text.slice(last, m.index)
                out.push(t)
              }
              const open = new Token('link_open', 'a', 1)
              open.attrs = [
                ['href', `/meta/issues/#${anchor}`],
                ['class', 'issue-link'],
                ['data-issue', extid],
              ]
              out.push(open)
              const label = new Token('text', '', 0)
              label.content = extid
              out.push(label)
              out.push(new Token('link_close', 'a', -1))
              last = m.index + extid.length
            }
            if (last < text.length) {
              const t = new Token('text', '', 0)
              t.content = text.slice(last)
              out.push(t)
            }
            block.children = out
          }
        }
      })

      // Escape { and } so Vue never treats {{ }} as interpolation. Pre-existing
      // docs use mustache-style braces inside code samples and tables.
      md.core.ruler.push('escape_braces', (state) => {
        const escape = (s: string): string =>
          s.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
        for (const block of state.tokens) {
          if (block.type === 'inline' && block.children) {
            for (const child of block.children) {
              if (
                (child.type === 'text' || child.type === 'code_inline') &&
                typeof child.content === 'string'
              ) {
                child.content = escape(child.content)
              }
            }
          } else if (block.type === 'code_block' && typeof block.content === 'string') {
            block.content = escape(block.content)
          }
        }
      })
    },
  },

  ignoreDeadLinks: true,

  vite: {
    optimizeDeps: {
      exclude: ['@resvg/resvg-js'],
    },
  },
})

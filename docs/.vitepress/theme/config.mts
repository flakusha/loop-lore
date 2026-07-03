export const nav = [
  { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
  { text: 'Reference', link: '/reference/api', activeMatch: '/reference/' },
  { text: 'API', link: '/api-reference/', activeMatch: '/api-reference/' },
  { text: 'GitHub', link: 'https://github.com/yourusername/loop-lore' }
]

export const sidebar = {
  '/guide/': [
    {
      text: 'Getting Started',
      items: [
        { text: 'Introduction', link: '/guide/getting-started' },
        { text: 'Installation', link: '/guide/installation' },
        { text: 'Architecture Overview', link: '/guide/architecture' }
      ]
    },
    {
      text: 'Features',
      items: [
        { text: 'Frontend Architecture', link: '/guide/frontend' },
        { text: 'TUI Mode', link: '/guide/tui' },
        { text: 'Assets System', link: '/guide/assets' },
        { text: 'Assistant System', link: '/guide/assistant' }
      ]
    }
  ],
  
  '/reference/': [
    {
      text: 'API Reference',
      items: [
        { text: 'Authentication', link: '/reference/auth' },
        { text: 'Users & Sessions', link: '/reference/users-sessions' },
        { text: 'Chats & Messages', link: '/reference/messages' },
        { text: 'Assets System', link: '/reference/assets' },
        { text: 'Assistant API', link: '/reference/assistant' }
      ]
    },
    {
      text: 'Database Schema',
      items: [
        { text: 'Overview', link: '/reference/schema' },
        { text: 'Users Table', link: '/reference/schema/users' },
        { text: 'Sessions Table', link: '/reference/schema/sessions' },
        { text: 'Chats Table', link: '/reference/schema/chats' },
        { text: 'Messages Table', link: '/reference/schema/messages' },
        { text: 'Assets Table', link: '/reference/schema/assets' }
      ]
    }
  ]
}
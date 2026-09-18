// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import DefaultTheme from 'vitepress/theme'
import 'vitepress-mermaid-renderer/css'
import { createMermaidRenderer } from 'vitepress-mermaid-renderer'
import './styles/custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    // vitepress-mermaid-renderer's API is a runtime singleton; bootstrap on first
    // client navigation. The singleton attaches a MutationObserver and renders
    // every ```mermaid block it finds.
    if (typeof window !== 'undefined') {
      const renderer = createMermaidRenderer({ securityLevel: 'loose' })
      // Trigger an initial scan after the SPA router finishes its first route.
      router.isReady?.().then?.(() => {
        // The observer inside the renderer handles DOM changes; this just kicks it.
        document.dispatchEvent(new Event('mermaid:rerender'))
      })
      // Stash on window for HMR access during dev.
      ;(window as unknown as { __mermaid: typeof renderer }).__mermaid = renderer
    }
  },
}

# TUI Implementation Details

TUI built with `blessed` + `blessed-contrib`. Terminal chat interface with integrated asset viewer.

## Source Files

| File                    | Purpose                               |
| ----------------------- | ------------------------------------- |
| `src/tui/app.ts`        | Main entry: screen, layout, shortcuts |
| `src/tui/chat.ts`       | Message history display, input relay  |
| `src/tui/asset-view.ts` | Asset browser (nav, link, delete)     |
| `src/tui/input.ts`      | Text input, submit handling           |

## Architecture

- **Screen Manager** (`src/tui/app.ts`): initializes blessed screen with smartCSR, keyboard shortcuts (Escape/q/Ctrl+C quit), layout management, cleanup.
- **Chat View** (`src/tui/chat.ts`): scrollable log, `addMessage()`, `setChatId()`, `loadAssetsForChat()`, `addAsset()`.
- **Asset View** (`src/tui/asset-view.ts`): Left/Right arrows navigate, Enter links (visual feedback), Delete removes, displays type/URL/caption.
- **Input Handler** (`src/tui/input.ts`): textbox with Enter submit, integration with chat view + assistant API.

## Data Flow

1. User types in input → Enter → chat view adds user message → sends to assistant API → response displayed
2. Chat ID set → loads assets for that chat
3. Asset navigation: arrows cycle items, Enter visual feedback, Delete removes + refreshes
4. Adding assets: asset service → link to chat → refresh view

## Keyboard Shortcuts

| Key             | Scope  | Action           |
| --------------- | ------ | ---------------- |
| Escape/q/Ctrl+C | Global | Quit             |
| Up/Down         | Chat   | Scroll history   |
| Left/Right      | Assets | Navigate items   |
| Enter           | Assets | Link feedback    |
| Delete          | Assets | Remove from chat |
| Enter           | Input  | Submit message   |

## Integration

- Asset Service: /api/assets
- Assistant Service: /api/assistant
- Base URL from env or relative

## Platform Notes

### Windows

- TUI works in Windows Terminal, ConEmu, or WSL2
- Mouse and resize events are not supported on Windows (blessed limitation)
- For full TUI experience on Windows, use WSL2 or Windows Terminal

### Android (Termux)

- TUI requires terminal with proper terminfo support
- No native GUI support
- External server binaries must be compiled for Android or run via Termux packages

## Startup

```bash
bun run src/tui/app.ts
```

Backend server must be running on expected port (default 3000).

## Future

Theming, mouse support, thumbnails, command history, split views, custom keybindings.

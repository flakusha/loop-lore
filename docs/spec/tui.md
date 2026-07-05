# TUI Implementation Details

## Overview

The Terminal User Interface (TUI) for loop-lore is built using the `blessed` and `blessed-contrib` libraries, providing a terminal-based chat interface with integrated asset viewer.

## Technology Stack

- **blessed**: A curses-like library with a high level API for creating terminal interfaces
- **blessed-contrib**: Additional widgets for blessed (tables, graphs, etc.)
- **TypeScript**: For type safety and better developer experience

## Architecture

### Core Components

1. **Screen Manager**: Handles the blessed screen and global keyboard events
2. **Chat View**: Displays message history and handles user input
3. **Asset View**: Displays assets linked to the current chat
4. **Input Handler**: Manages user input and submits messages
5. **Service Integrations**: Connects to backend APIs

## Component Details

### Screen Manager (`src/tui/app.ts`)

- Initializes the blessed screen with smartCSR and auto-padding
- Sets up global keyboard shortcuts (exit on Escape/q/Ctrl+C)
- Manages the layout of child components (chat, assets, input)
- Handles screen rendering and cleanup

### Chat View (`src/tui/chat.ts`)

- Displays message history in a scrollable log
- Methods:
  - `addMessage(message: string)`: Adds a message to the chat log
  - `setChatId(chatId: string)`: Sets the current chat and loads its assets
  - `loadAssetsForChat()`: Fetches and displays assets for current chat
  - `addAsset(url: string, type: string, caption?: string)`: Adds asset linked to current chat
- UI: Log widget with scrolling capabilities

### Asset View (`src/tui/asset-view.ts`)

- Displays assets for the current chat with navigation
- Features:
  - Left/Right arrow navigation through assets
  - Enter key to "link" asset (visual feedback)
  - Delete key to remove asset from chat
  - Displays asset details (type, URL, caption)
- UI: Box widget showing current item details and controls

### Input Handler (`src/tui/input.ts`)

- Manages the text input box at the bottom of the screen
- Features:
  - Input box with focus management
  - Enter key to submit message
  - Integration with chat view and assistant API
- UI: Textbox widget with submit event handling

## Data Flow

1. **User Input**:
   - User types in input box and presses Enter
   - Input handler captures the text and clears the input
   - Chat view adds user message to display
   - Application sends message to backend assistant API
   - Assistant response is displayed in chat view

2. **Asset Interaction**:
   - When chat ID is set, chat view loads assets for that chat
   - Asset view displays assets for the current chat
   - User navigates assets with left/right arrows
   - Pressing Enter on an asset provides visual feedback (asset is already linked via chatId)
   - Pressing Delete removes the asset from chat and refreshes view

3. **Asset Updates**:
   - Adding assets: Chat view calls asset service to add asset linked to current chat
   - After addition, asset view refreshes to show new asset
   - Asset view also refreshes when navigating away and back to a chat

## Styling and Theming

- Uses blessed's built-in styling capabilities
- Colors defined per component for clarity
- Focus indicators for interactive elements
- Responsive layout that adapts to terminal size

## Keyboard Shortcuts

- **Global**:
  - Escape/q/Ctrl+C: Quit application
- **Chat View**:
  - Up/Down Arrow: Scroll message history
- **Asset View** (when active):
  - Left/Right Arrow: Navigate asset items
  - Enter: Link current asset to chat (feedback only)
  - Delete: Remove current asset from chat
- **Input**:
  - Enter: Submit message
  - Up/Down Arrow: Navigate command history (if implemented)

## Integration with Backend

- Asset Service: Communicates with `/api/assets` endpoints
- Assistant Service: Communicates with `/api/assistant` endpoint
- Base URL configured via environment variables or relative to current origin

## Implementation Notes

### Blessed Library Usage

- All UI components are created as blessed widgets
- Screen rendering is triggered manually after updates
- Event handling is done through blessed's event system
- Proper cleanup on exit to restore terminal state

### State Management

- Current chat ID is shared between chat view and asset view
- Asset data is fetched per chat and cached in the asset view
- Loading states could be added for better UX (future improvement)

### Extensibility

- New views can be added by creating new blessed widgets
- Additional keyboard shortcuts can be registered in the screen manager
- Service integrations are abstracted for easy mocking/testing

## Future Enhancements

1. **Theming Support**: Allow custom color schemes
2. **Mouse Support**: Enable mouse interactions where supported by terminal
3. **Enhanced Assets**: Thumbnail previews, image viewing
4. **Command History**: In input box for easy recall
5. **Split Screen Views**: Multiple panes for chat, assets, and user list
6. **Custom Keybindings**: User-configurable keyboard shortcuts

## Related Files

- `src/tui/app.ts` - Main TUI application entry point
- `src/tui/chat.ts` - Chat display and interaction
- `src/tui/asset-view.ts` - Asset browsing and interaction
- `src/tui/input.ts` - User input handling
- `src/assets/` - Asset service and API routes
- `src/assistant/` - Assistant service and API routes

## Reference Implementation

For additional reference on terminal UI patterns and implementation, see the `opencode` project located at `../opencode/` which contains examples of:

- Terminal-based applications
- Interactive CLI tools
- Node.js terminal utilities with similar libraries

## Usage

To start the TUI interface:

```bash
bun run src/tui/app.ts
```

Ensure the backend server is running on the expected port (default: 3000) for API integration.

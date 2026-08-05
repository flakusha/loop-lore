# Refinement: Location-Based Chat States

## Key Improvements

- **Command Context Registry**: Map commands to locations via `location_commands` table (e.g., `/trade` only in "market" locations).
- **Ambient State Sync**: Use WebSocket to push location-specific effects (music, weather) to all clients in that location.
- **Achievement Triggers**: Hook into `location_visit` events (already in epic-achievements.md) for auto-unlock.

## Technical Considerations

```typescript
// Example command-location mapping
const locationCommands = {
  market: ["/trade", "/buy", "/sell",],
  tavern: ["/drink", "/gamble", "/rumor",],
  dungeon: ["/explore", "/loot", "/rest",],
};
```

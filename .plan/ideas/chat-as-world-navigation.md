# Refinement: Chat-as-World Navigation

## Key Improvements

- **Map Integration**: Embed chat in 3D world maps (like Mapbox + Discord chat).
- **Location Tags**: Allow users to tag locations with keywords for search (e.g., "#quest_start").
- **NPC Dialogue Trees**: Pre-scripted NPC responses tied to location context.

## Technical Considerations

```typescript
interface LocationTag {
  id: string;
  locationId: string;
  keywords: string[];
  messageId?: string; // linked chat message
}
```

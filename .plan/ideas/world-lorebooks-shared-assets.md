# Refinement: World Lorebooks as Shared Assets

## Key Improvements

- **Real-Time Collaboration**: Use Yjs (JavaScript CRDT) for conflict-free editing across multiple users.
- **Version Control**: Snapshot lorebook changes for rollback (like Git commits).
- **AI Enhancement**: Auto-generate lorebook entries from world events (e.g., "Dragon attacked the village" → lorebook entry).

## Technical Considerations

```bash
# Example CRDT structure for collaborative editing
{
  "id": "lorebook_entry_123",
  "content": "The dragon's hoard contained...",
  "author": "user_456",
  "timestamp": "2026-08-05T12:00:00Z",
  "conflicts": []
}
```

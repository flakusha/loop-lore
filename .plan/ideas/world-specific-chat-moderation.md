# Refinement: World-Specific Chat Moderation

## Key Improvements

- **Rule Engine**: Implement a lightweight rule engine (like Apache Flink) for real-time moderation.
- **Context-Aware Filtering**: Block messages based on location + time + user role (e.g., "block swear words in tavern during night").
- **Appeal System**: Users can appeal moderation actions with context (e.g., "I was using the word in a quote").

## Technical Considerations

```yaml
# Example context-aware rule
rule: block_swear_words
  conditions:
    location: tavern
    time: night
    role: guest_user
  action: kick_user
```

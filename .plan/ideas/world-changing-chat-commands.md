# Refinement: World-Changing Chat Commands

## Key Improvements

- **Command Parser**: Implement a DSL (domain-specific language) for world-modifying commands.
- **Safety Checks**: Validate commands against world state (e.g., "cannot spawn dragon if dragon already exists").
- **Undo/Redo**: Support undo/redo for world-changing commands (like Figma history).

## Technical Considerations

```bash
# Example command DSL
cmd: create_item
  parameters:
    name: string
    type: item_type
    location: location_id
  preconditions:
    - location_exists
    - item_type_allowed
  postconditions:
    - item_created
    - notify_subscribers
```

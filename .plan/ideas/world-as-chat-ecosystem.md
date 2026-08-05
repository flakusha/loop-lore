# Refinement: World-as-Chat Ecosystem

## Key Improvements

- **Channel Hierarchy**: Implement nested channels (like Discord) for world locations (e.g., "Bank/ATM", "Guild HQ/Meeting Room").
- **Moderation API**: Add `/world moderation` commands to set rules per channel (e.g., "block_magic_in_chat: true").
- **Cross-World Mentioning**: Allow users to mention world-specific roles (e.g., @bank_guild_master) across worlds.

## Technical Considerations

```bash
# Example moderation rules file structure
[channel:bank/atm]
  permissions:
    - allow: [guild_members, admins]
    - block: [guest_users]
```

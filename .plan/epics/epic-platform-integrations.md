# EPIC: Platform Integrations (Draft — TBD)

**Status:** 📝 Draft (TBD)
**Priority:** Low
**Effort:** TBD
**Type:** Draft Epic

## Summary

Integrations with other platforms — draft, to be confirmed. Potential integrations with external services, APIs, and platforms.

## Potential Integrations

| Platform | Integration Type | Status |
| -------- | ---------------- | ------- |
| SillyTavern | Character card import/export | ✅ Partial (Epic 14) |
| RisuAI | Character card import | ⬜ Not Started |
| Character.AI | Character import | ⬜ Not Started |
| OpenAI API | LLM provider | ✅ Built |
| Anthropic API | LLM provider | ⬜ Not Started |
| Ollama | Local LLM | ⬜ Not Started |
| Stable Diffusion | Image generation | ⬜ Not Started |
| ComfyUI | Image generation | ⬜ Not Started |
| Discord | Bot integration | ⬜ Not Started |
| Telegram | Bot integration | ⬜ Not Started |

## Scope

- API integrations with external services
- Bot integrations (Discord, Telegram)
- LLM provider integrations
- Image generation integrations
- Character platform integrations

## Tasks

- [ ] Define integration priority list
- [ ] Design integration architecture
- [ ] Implement high-priority integrations
- [ ] Document integration APIs

## Files

- `src/integrations/` — integration modules (does not exist yet)
- `src/routes/integrations.ts` — integration API endpoints
- `docs/spec/integrations/` — integration specifications

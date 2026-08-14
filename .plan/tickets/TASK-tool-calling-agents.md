# TASK: Tool-Calling Agent Integration

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Created:** 2026-08-14
**Source:** Platform research deep-dive (Convai, SillyTavern)

## Description

Implement tool-calling system where the assistant can invoke external tools and services during generation. Inspired by Convai's MCP-style connectors and SillyTavern's tool calling system.

## Requirements

1. **Tool Registration**: register tools with name, description, parameters schema, handler function
2. **LLM Integration**: LLM can request tool execution during generation
3. **Tool Response Handling**: tool results fed back into LLM context for next generation step
4. **MCP Compatibility**: support Model Context Protocol for external tool integration
5. **Tool Categories**: RPG tools (dice, combat, inventory), world tools (weather, time), assistant tools (memory, search)
6. **Security**: tool execution sandboxed, user approval for destructive actions
7. **Streaming**: tool calls visible in SSE stream for real-time UI

## Mapping

- **Platform Candidate**: Convai tool-calling, SillyTavern tool calling
- **Epic**: Platform Research (#24)
- **Integration**: plugin system, assistant system, turn orchestration

## Acceptance Criteria

- [ ] Tools can be registered with schema
- [ ] LLM can invoke tools during generation
- [ ] Tool results fed back into context
- [ ] MCP protocol supported
- [ ] Tool calls visible in SSE stream

## References

- Convai tool-calling agents: https://convai.com/blog/agentic-platform-virtual-worlds-convai
- SillyTavern tool calling: https://deepwiki.com/SillyTavern/SillyTavern/3.5-tool-calling-and-function-execution

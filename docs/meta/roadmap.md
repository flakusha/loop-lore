# Roadmap

This document outlines potential future features and improvements for loop-lore, inspired by related projects and community needs.

## Inspiration Sources

### Odysseus Features

- **Chat + Agents**: Local/API model integration, tool usage, MCP integration, file operations, shell access, skill systems, and memory persistence
- **Cookbook**: Hardware-aware model recommendations, automated downloads, and serving optimizations
- **Deep Research**: Multi-step web research with source citation and report generation
- **Compare**: Blind side-by-side model testing with automated synthesis
- **Documents**: Writing-first editor with AI-assisted editing, suggestions, and multi-format support (Markdown, HTML, CSV)
- **Email**: Full IMAP/SMTP client with triage, tagging, summarization, reminders, and AI-assisted replies
- **Notes, Tasks + Calendar**: Integrated task management, reminders, scheduled agent tasks, and CalDAV synchronization
- **Extras**: Gallery/image editor, theming system, file uploads, web search integration, session management, and 2FA

### Open WebUI Features

- **Flexible Installation**: Multiple deployment options (pip, Docker, Kubernetes, native)
- **Broad Model Support**: Unified interface for Ollama, OpenAI-compatible APIs, LMStudio, GroqCloud, Mistral, vLLM, etc.
- **Advanced Access Control**: Granular RBAC, user groups, and permission systems
- **Extensible Plugin System**: Filters, Actions, Pipes, Tools, Skills with MCP/MCPO/OpenAPI integration
- **Custom Agents**: Model wrapping with custom instructions, tools, knowledge bases, and access controls
- **Persistent Memory**: Cross-conversation context retention and factual recall
- **Advanced Features**:
  - Notes & Channels for collaborative workspaces
  - Calendar & AI scheduling through function calling
  - Automations with recurring prompt execution
  - Responsive design with PWA support
  - Rich media support (Markdown, LaTeX, voice/video, image generation/editing)
  - Multi-model conversations for ensemble reasoning
  - Usage analytics and model evaluation (A/B testing, ELO leaderboards)
  - Flexible storage (SQLite/PostgreSQL, S3/GCS/Azure blob storage)
  - Advanced vector DB support (Chroma, PGVector, Qdrant, Milvus, etc.)
  - Enterprise auth (LDAP/AD, SSO, SCIM provisioning)
  - Cloud storage integration (Google Drive, OneDrive/SharePoint)
  - Production observability (OpenTelemetry)
  - Horizontal scalability (Redis sessions, WebSocket support)
  - Multilingual support

## Dual-Use Architecture: RPG + Agentic Workspace

loop-lore is designed as a **dual-mode application**:

1. **RPG Mode** (default) — Roleplay chat with characters, worlds, and story-focused features
2. **Agentic Workspace Mode** — AI-assisted workspaces where agents solve problems, execute code, and conduct research

See [Use Case: Agentic Assistant Workspace](../spec/use-case-agentic-workspace.md) for the full mapping of RPG concepts to agentic concepts (Worlds→Epics, Locations→Tasks, Characters→Agents) and the plugin system design.

---

## Planned Features for loop-lore

### Plugin System

- [ ] **Plugin System**: Server-side extensions for custom functionality (tools, agent roles, UI components, API routes)
- [ ] **Plugin Registry**: Community plugin marketplace with install/enable/disable API
- [ ] **Core Plugins**: Built-in plugins for dice rolling, code execution, web research, file operations
- [ ] **Client Extensions**: WebUI/TUI plugin architecture

### Agentic Assistant Workspace (Alternative Use Case)

- [ ] **Epic/Task Mapping**: Worlds → Epics, Locations → Tasks, Characters → Agents
- [ ] **Agent Runtime**: Tool-use framework, code execution, web research, file operations
- [ ] **Agent Roles**: Built-in roles (researcher, coder, analyst, writer, planner) + custom via plugins
- [ ] **Agent Memory**: Episodic (chat history), Semantic (extracted facts), Procedural (learned patterns)
- [ ] **Artifacts System**: Code files, documents, datasets, notebooks as polymorphic assets
- [ ] **Workspace UI**: Task-focused workspaces with agent collaboration panels

### Core RPG Chat Enhancements

- [ ] **Advanced Memory Systems**: Long-term character/world memory with retrieval mechanisms
- [ ] **Lorebook/World Info System**: Sticky entries, cooldowns, delays, and activation conditions
- [ ] **Multi-modal Support**: Image/audio/video generation and analysis within chat
- [ ] **Character Cards**: Full V2/V3 PNG and JSON character card import/export
- [ ] **Prompt Enhancement**: Automated prompt improvement suggestions
- [ ] **Streaming Responses**: Real-time token streaming with visual feedback

### Infrastructure & Architecture

- [ ] **Plugin System**: Server-side extensions for custom functionality
- [ ] **Client Extensions**: WebUI/TUI plugin architecture
- [ ] **Event Bus Maturation**: Robust event system for loose coupling
- [ ] **Provider Registry**: Clean LLM backend abstraction layer
- [ ] **Database Peripherals**: Connection pooling, query caching, read replicas
- [ ] **Migration Tools**: Easy import/export from other platforms (SillyTavern, etc.)
- [ ] **Storage Abstraction**: Pluggable storage backends for assets and metadata (local/S3/GCS)
- [ ] **Observability**: Integration with OpenTelemetry for metrics, tracing, and logging
- [ ] **Horizontal Scaling**: Redis-backed sessions, WebSocket support for horizontal scaling
- [ ] **Build System**: Standardized build pipeline with Bun, Docker support, and Kubernetes manifests

### User Experience Improvements

- [ ] **Theming System**: Customizable UI themes for both TUI and WebUI
- [ ] **Session Management**: Multiple concurrent sessions per user
- [ ] **Role-Based Access**: Admin/user/guest roles with granular permissions
- [ ] **Export/Import**: Chat/character/world backup and migration tools
- [ ] **Search & Filter**: Full-text search across messages, characters, and lore
- [ ] **Notifications**: Configurable alert system for events and mentions
- [ ] **Internationalization**: Full i18n support for UI, with language selection per user (see [internationalization.md](./frontend/internationalization.md))
- [ ] **Accessibility**: Screen reader support, keyboard navigation, and ARIA compliance
- [ ] **Progressive Web App (PWA)**: Offline support, installability, and push notifications

### Advanced AI Features

- [ ] **Tool Use Framework**: Standardized interface for AI to use external tools
- [ ] **Function Calling**: Structured API for AI to execute predefined functions
- [ ] **Retrieval Augmented Generation (RAG)**: Document ingestion and semantic search
- [ ] **Model Comparison**: Side-by-side model testing with automated evaluation
- [ ] **Workflow Automation**: Chains of prompts and actions for complex tasks
- [ ] **Agent Systems**: Specialized AI agents with defined roles and capabilities
- [ ] **Multi-Agent Collaboration**: Support for multiple agents working together on complex tasks
- [ ] **Structured Output**: Enforcing JSON/YAML/structured output from LLMs for agent workflows
- [ ] **Prompt Chaining**: Reusable prompt templates and chains for complex reasoning
- [ ] **Tool Chaining**: Dynamically chaining tool outputs as inputs to other tools
- [ ] **AutoGPT-like Agents**: Autonomous agents that can self-direct and chain thoughts

### Administrative & Operational Features

- [ ] **Admin Dashboard**: System metrics, usage statistics, and performance monitoring
- [ ] **User Management**: Registration, profiles, preferences, and activity tracking
- [ ] **Backup & Recovery**: Automated backup schedules and point-in-time recovery
- [ ] **Audit Logging**: Comprehensive activity logs for security and debugging
- [ ] **Rate Limiting & Quotas**: Per-user/resource usage controls
- [ ] **API Versioning**: Stable API contracts with versioned endpoints
- [ ] **Health Checks**: Service monitoring and automated recovery mechanisms
- [ ] **Billing & Usage Tracking**: Metered usage for cloud deployments, optional billing integration
- [ ] **LDAP/AD Integration**: Enterprise authentication via LDAP/Active Directory
- [ ] **SAML/OIDC Support**: Single Sign-On via SAML or OpenID Connect
- [ ] **SCIM Provisioning**: Automated user provisioning via SCIM protocol

### Integration & Extensibility

- [ ] **Webhook System**: Outgoing integrations for external services
- [ ] **API-First Design**: Complete RESTful API with WebSocket support
- [ ] **Authentication Providers**: OAuth, LDAP, and external identity provider support
- [ ] **Storage Backends**: Pluggable storage for assets and metadata (local/S3/GCS)
- [ ] **Vector Database Options**: Multiple embedding store choices for RAG (Chroma, PGVector, Qdrant, Milvus, etc.)
- [ ] **Model Hub Integration**: Direct access to Hugging Face and similar model repositories
- [ ] **Cross-Platform Clients**: Mobile and desktop native applications
- [ ] **File System Integrations**: Google Drive, OneDrive, Dropbox sync plugins
- [ ] **Communication Integrations**: Slack, Discord, Telegram bot/plugins for notifications and commands
- [ ] **CI/CD Integrations**: GitHub Actions, GitLab CI, Jenkins plugins for DevOps workflows

## Long-term Vision

- **Federated Identity**: Decentralized authentication via Web3/DID solutions
- **Peer-to-Peer Modes**: Offline-first and sync-when-available capabilities
- **Marketplace**: Community-sharing platform for characters, lorebooks, and plugins
- **Analytics Suite**: Advanced usage insights and behavior tracking
- **Accessibility & Internationalization**: Screen reader support, keyboard navigation, and full internationalization (see [internationalization.md](./frontend/internationalization.md))
- **Performance Optimization**: Advanced caching, query optimization, and resource management
- **Research Tools**: Academic collaboration features and experiment tracking
- **Decentralized Storage**: IPFS/Filecoin integration for asset storage and content addressing
- **DAO Governance**: Community-driven governance via token-weighted voting and proposals
- **AI-Generated Content**: Procedural generation of worlds, characters, lore, and quests using LLMs
- **XR/VR Integration**: Virtual and augmented reality clients for immersive roleplay and workspaces
- **Real-time Collaboration**: Google Docs-style collaborative editing for documents, code, and world-building
- **Simulation Sandboxes**: Isolated environments for testing agents, code, and simulations
- **Edge Computing**: Deployment to edge networks for low-latency interactions
- **Quantum-Resistant Cryptography**: Post-quantum security for sensitive data and communications
- **Neuro-Symbolic AI**: Integration of neural networks with symbolic reasoning for enhanced agent capabilities

## Contribution Guidelines

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed information on:

- Reporting issues
- Suggesting features
- Submitting pull requests
- Code review process
- Development setup
- Testing guidelines

## Timeline

This roadmap is subject to change based on community feedback, contributor availability, and evolving technical priorities. Features may be reprioritized, combined, or split as needed.

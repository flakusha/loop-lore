# Use Cases Research: Ordinary Assistant / Agentic / Business Applications

## Overview

loop-lore serves three primary use case categories through a unified architecture:
1. **Ordinary Assistant** — traditional chat assistance with LLM capabilities
2. **Agentic Mode** — AI agents for research, code, data analysis tasks
3. **Business Applications** — professional use cases leveraging the story/RPG infrastructure

All modes share the same core entities (Worlds, Actors, Chats, Messages, Assets) with
different semantic interpretations per mode.

---

## 1. Ordinary Assistant Use Cases

### Core Assistant Capabilities (Implemented)

The assistant operates as a **per-chat configurable entity** with three roles:

| Role | Description | Capabilities |
|------|-------------|--------------|
| Pure Assistant | Default helper | Text improvement, image generation, idea suggestions, troubleshooting |
| Game Master (GM) | Story orchestrator | Turn selection, quality evaluation, quest management, world state updates |
| Moderator | Safety/oversight | Content review, rule enforcement, narrative guidance |

### Current Implementation

- Located in `src/assistant/` with prompt assembly pipeline
- Supports `/improve`, `/dice`, `/stats` commands via text command parsing
- Rule-based responder exists; per-chat configurable entity pending
- Prompt sections injected: actor context, chat history, world lore, memories

### User Personas

| Persona | Primary Needs | How loop-lore Serves |
|---------|---------------|---------------------|
| Solo RPer | Character interaction, narrative immersion | User × Character chat, optional GM for mechanics |
| Collaborative Writer | Multi-character storytelling | User × User chat, shared world context |
| Worldbuilder | Lore management, consistency | ActorLoreEntries, WorldLoreEntries, lore injection |
| Casual Chat User | Text generation, creative prompts | Direct chat mode, asset gallery |

---

## 2. Agentic Mode Use Cases

### Entity Mapping (RPG → Agentic)

| RPG Concept | Agentic Interpretation | Purpose |
|-------------|---------------------|---------|
| **World** | **Epic** | Project/research initiative. Lore becomes project context |
| **Location** | **Task** | Discrete work unit with DAG dependencies |
| **Character** | **Agent** | AI agent with specialized role (researcher, coder, analyst, writer) |
| **Chat** | **Workspace** | 1:1 or multi-agent conversation per task |
| **Message** | **Message** | Extended with `tool_call`, `tool_result`, `code` content types |
| **Asset** | **Artifact** | Code, documents, reports, charts linked polymorphically |

### Agent Capabilities (Planned)

#### Built-in Tool Categories

| Category | Tools | Business Value |
|----------|-------|---------------|
| Web Research | `search`, `extract`, `deep_research` | Market research, competitive analysis |
| Code Execution | `run_code`, `run_shell`, `read_file`, `write_file` | Automation, development assistance |
| Data Analysis | `query_sql`, `analyze_csv`, `plot` | Business intelligence, reporting |
| Document Ops | `create_doc`, `edit_doc`, `convert_format` | Documentation, report generation |
| API/Integration | `http_request`, `mcp_call` | System integration, workflow automation |

### Business Workflows

#### 1. Research & Analysis Pipeline

```
User → Agent (Researcher) → Deep Research → Analysis → Report Artifact
```

- Agent performs multi-step web research with citations
- Extracts structured data from sources
- Synthesizes findings into a report (linked as asset)
- Citations stored as metadata for audit trail

#### 2. Code Generation & Execution

```
User → Agent (Coder) → Code Generation → Execution → Artifact
```

- Agent generates code based on requirements
- Executes in sandboxed environment
- Captures output as artifact (code file, log, result)
- Iterative refinement via regeneration

#### 3. Data Processing Workflow

```
User uploads CSV → Agent (Analyst) → Query → Visualize → Report
```

- Agent queries uploaded data via SQL
- Generates visualizations (charts as image assets)
- Produces analysis report with findings

#### 4. Content Creation Pipeline

```
User → Agent (Writer) → Draft → Improve → Export
```

- Agent creates draft content
- Uses `/improve` for refinement
- Exports to multiple formats (PDF, DOCX, Markdown)

---

## 3. Business Application Use Cases

### Professional Scenarios

#### A. Knowledge Worker Assistant

**Use Case**: Research analyst automating routine tasks

- **World** = Research project
- **Agents** = Specialized assistants (literature review, data analysis, writing)
- **Artifacts** = Reports, charts, datasets
- **Memory** = Learned patterns, preferred sources, past analysis approaches

**Value Proposition**:
- Reduces manual research time by 60-80%
- Ensures citation consistency
- Maintains project context across sessions

#### B. Creative Studio

**Use Case**: Writer collaborating with AI on story development

- **World** = Story universe
- **Agents** = Character actors, narrator
- **Quest System** = Plot arcs, character development goals
- **Assets** = Character art, scene illustrations, storyboards

**Value Proposition**:
- Maintains character consistency across chapters
- Tracks plot threads and foreshadowing
- Generates visual references for scenes

#### C. Development Environment

**Use Case**: Developer using AI agents for coding tasks

- **World** = Code project
- **Agents** = Backend coder, frontend coder, tester, reviewer
- **Tasks** = Location-based work units (features, bugs, refactorings)
- **Artifacts** = Code files, test results, documentation

**Value Proposition**:
- Multi-agent code review workflow
- Automated test generation from edge cases
- Documentation synced with code changes

#### D. Training & Education

**Use Case**: Educational roleplay for soft skills training

- **World** = Training scenario (customer service, negotiation)
- **Agents** = Trainees, simulated customers/clients
- **Metrics** = Skill check scores, behavior tracking
- **Feedback** = Post-session analysis, improvement suggestions

**Value Proposition**:
- Safe practice environment
- Objective performance metrics
- Consistent evaluation criteria

---

## 4. Cross-Cutting Features

### Shared Infrastructure

All use cases benefit from:

| Feature | RPG Use | Agentic Use | Business Use |
|---------|---------|-------------|--------------|
| Asset System | Character art, maps | Reports, charts, code | Documents, presentations |
| Memory System | Character memories | Learned patterns | Project knowledge |
| Quest System | Story objectives | Task completion | Project milestones |
| Turn Orchestration | Character turns | Agent coordination | Workflow steps |
| Quality Evaluation | Narrative quality | Output correctness | Deliverable standards |
| Synthetic Testing | Story validation | Agent verification | Regression testing |

### Configuration

```yaml
modes:
  rpg:
    enabled: true
    mechanics:
      dice: true
      stats: true
      combat: true
      skills: true
      xp: true
  agentic:
    enabled: true
    tools:
      web: true
      code: true
      data: true
      document: true
    maxConcurrentAgents: 3
    toolTimeoutMs: 120000

# Shared settings
quality:
  evaluator:
    enabled: true
    thresholds:
      accept: 70
      regenerate: 40
      escalate: 40
```

---

## 5. Implementation Status

### Implemented (Partial)

- Dice engine (`plugins/core/dice-roller/`)
- Turn manager (`src/turning/`)
- Game master service (`src/story/game-master.ts`)
- Quest engine (`src/story/quests/`)
- World state service (`src/story/world-state.ts`)
- Quality evaluator (`src/story/quality/`)
- Synthetic data generator (`src/story/synthetic/`)

### Pending

- Agent runtime (refactor `src/assistant/` → `src/agent/`)
- Tool registry and sandboxing
- Task/location graph for agentic mode
- Artifact export pipeline
- Multi-user collaboration in agentic mode

---

## 6. Competitive Advantages

### vs. Pure Chat Applications

- **Stateful context**: Worlds and locations maintain persistent state
- **Multi-agent orchestration**: Multiple LLMs can collaborate with GM oversight
- **Verification pipeline**: Quality evaluation prevents hallucinations
- **Synthetic testing**: Automated regression ensures consistency

### vs. Agent Platforms

- **Narrative-first**: Natural language interaction preferred over API calls
- **Flexible semantics**: Same infrastructure supports creative and analytical work
- **World modeling**: Rich context modeling beyond simple prompt/response
- **Turn-based control**: Deterministic mode for reproducible results

### vs. RPG Platforms

- **LLM-native**: Designed for AI-generated content, not manual GM management
- **Dual-state actors**: Characters adapt to different world contexts
- **Event-driven updates**: World state evolves from narrative, not manual entry
- **Asset integration**: Images, audio, video as first-class entities
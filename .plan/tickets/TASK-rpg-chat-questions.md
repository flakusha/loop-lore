# TASK: RPG Chat with Question-Based Gameplay

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** Medium
**Effort:** Large
**Status:** Not Started

## Summary

Implement RPG chat with question-based gameplay — instead of playing directly with text, players choose variants. Includes LLM post-completion questioning, creative re-review, turn management, and frontend navigation integration.

## Core Concept

Instead of free-text input, players receive structured questions/choices that drive the story forward. This creates a more guided, interactive RPG experience.

## Features

### Question-Based Gameplay
- **Multiple Choice Questions**: Players select from predefined options
- **Branching Narratives**: Choices affect story direction
- **Consequence Tracking**: Choices have lasting impact
- **Question Types**: Dialogue, action, exploration, combat

### LLM Post-Completion Questioning
- After LLM generates narrative, present follow-up questions
- Clarify ambiguous situations
- Offer alternative interpretations
- Validate player intent

### Creative Re-Review & Reiteration
- Internal review of generated content
- Quality assessment and improvement
- Alternative narrative generation
- Creative direction refinement

### Turn Management After Answer Selection
- Process selected answer
- Update game state
- Generate next narrative segment
- Present new questions

### Frontend Navigation Integration
- Mouse click selection
- Keyboard navigation (arrow keys, number keys)
- Touch support for mobile
- Accessibility support

## Design

### Question Structure

```typescript
interface RPGQuestion {
  id: string;
  type: 'dialogue' | 'action' | 'exploration' | 'combat' | 'custom';
  text: string;
  options: RPGQuestionOption[];
  context: QuestionContext;
  timeLimit?: number; // seconds
  requiredChoice?: boolean;
}

interface RPGQuestionOption {
  id: string;
  text: string;
  consequences: Consequence[];
  requirements: OptionRequirement[];
  nextQuestion?: string; // question ID
  narrative?: string; // narrative to generate
}

interface QuestionContext {
  location: string;
  characters: string[];
  inventory: string[];
  questState: Record<string, unknown>;
  gameState: Record<string, unknown>;
}
```

### Question Flow

```
Question Flow:
├── Generate narrative segment
├── Present question with options
├── Player selects option
├── Process consequences
├── Update game state
├── Generate next narrative
└── Repeat
```

### LLM Integration

```typescript
interface LLMQuestionFlow {
  // Generate narrative with question prompts
  generateNarrativeWithContext(context: GameContext): Promise<Narrative>;
  
  // Generate follow-up questions after narrative
  generateFollowUpQuestions(narrative: Narrative): Promise<RPGQuestion[]>;
  
  // Re-review and improve narrative
  reReviewNarrative(narrative: Narrative): Promise<Narrative>;
  
  // Process player choice and generate continuation
  processChoiceAndContinue(choice: PlayerChoice): Promise<Narrative>;
}
```

### Frontend Navigation

```typescript
interface QuestionNavigation {
  // Mouse/keyboard navigation
  selectOption(index: number): void;
  navigateUp(): void;
  navigateDown(): void;
  confirmSelection(): void;
  
  // Touch support
  touchSelect(optionId: string): void;
  swipeNavigation(direction: 'up' | 'down'): void;
  
  // Accessibility
  announceOption(option: RPGQuestionOption): void;
  readQuestionAloud(): void;
}
```

## Tasks

- [ ] Design question data model
- [ ] Implement question types
- [ ] Implement multiple choice system
- [ ] Implement branching narratives
- [ ] Implement consequence tracking
- [ ] Implement LLM post-completion questioning
- [ ] Implement creative re-review system
- [ ] Implement turn management
- [ ] Implement frontend navigation
- [ ] Implement keyboard shortcuts
- [ ] Implement touch support
- [ ] Implement accessibility features
- [ ] Create question UI components
- [ ] Write tests for question system

## Files

- `src/rpg/questions.ts` — question system
- `src/rpg/question-flow.ts` — question flow management
- `src/rpg/llm-integration.ts` — LLM integration
- `src/rpg/narrative-review.ts` — creative re-review
- `src/db/schema-questions.ts` — question tables
- `src/routes/questions.ts` — question API
- `src/frontend/rpg/questions/` — question UI
- `src/frontend/rpg/navigation.ts` — navigation system

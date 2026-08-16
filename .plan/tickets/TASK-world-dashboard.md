<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: World Dashboard

**Status:** ⬜ Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Epic:** epic-world-management-ui

## Summary

Implement world management dashboard with world list, conditions display, settings editor, and world lore editor.

## Acceptance Criteria

- [ ] World list with previews
- [ ] Create new world wizard
- [ ] World conditions display (weather, time, season)
- [ ] World settings editor
- [ ] World lore editor
- [ ] Mobile responsive

## Implementation Details

### World Dashboard Component

```typescript
// src/frontend/world/world-dashboard.ts
export interface World {
  id: string;
  name: string;
  style: WorldStyle;
  conditions: WorldConditions;
  lore: WorldLore;
  locationCount: number;
  npcCount: number;
  lastModified: Date;
}

export interface WorldStyle {
  type: "fantasy" | "real" | "cyberpunk" | "scifi" | "postapocalyptic" | "custom";
  substyle?: string;
}

export interface WorldConditions {
  weather: WeatherState;
  timeOfDay: TimeOfDay;
  season: Season;
  globalModifiers: Modifier[];
}

export interface WorldLore {
  summary: string;
  history: string;
  rules: string[];
  customLore: string;
}
```

### World Dashboard Layout

```html
<!-- World dashboard -->
<div class="world-dashboard">
  <!-- Header -->
  <div class="dashboard-header">
    <h1>Worlds</h1>
    <button class="btn-primary" data-action="create-world">
      <span>+</span> Create World
    </button>
  </div>

  <!-- World list -->
  <div class="world-list">
    <div class="world-card" data-world-id="1">
      <div class="world-preview">
        <span class="world-icon">🌍</span>
        <span class="world-style">Fantasy</span>
      </div>
      <div class="world-info">
        <h3>The Forgotten Realms</h3>
        <p class="world-description">A high fantasy world with magic and dragons...</p>
        <div class="world-stats">
          <span>📍 12 Locations</span>
          <span>👤 8 NPCs</span>
          <span>📅 Modified: 2 hours ago</span>
        </div>
      </div>
      <div class="world-conditions">
        <span class="condition">🌙 Night</span>
        <span class="condition">🌧️ Rainy</span>
        <span class="condition">🍂 Autumn</span>
      </div>
      <div class="world-actions">
        <button class="btn-secondary" data-action="edit-world">Edit</button>
        <button class="btn-secondary" data-action="explore-world">Explore</button>
        <button class="btn-danger" data-action="delete-world">Delete</button>
      </div>
    </div>

    <div class="world-card" data-world-id="2">
      <div class="world-preview">
        <span class="world-icon">🌆</span>
        <span class="world-style">Cyberpunk</span>
      </div>
      <div class="world-info">
        <h3>Neon District</h3>
        <p class="world-description">A dark cyberpunk city with neon lights...</p>
        <div class="world-stats">
          <span>📍 8 Locations</span>
          <span>👤 15 NPCs</span>
          <span>📅 Modified: 1 day ago</span>
        </div>
      </div>
      <div class="world-conditions">
        <span class="condition">🌙 Night</span>
        <span class="condition">🌧️ Acid Rain</span>
        <span class="condition">❄️ Winter</span>
      </div>
      <div class="world-actions">
        <button class="btn-secondary" data-action="edit-world">Edit</button>
        <button class="btn-secondary" data-action="explore-world">Explore</button>
        <button class="btn-danger" data-action="delete-world">Delete</button>
      </div>
    </div>
  </div>

  <!-- World details panel -->
  <div class="world-details-panel">
    <div class="details-header">
      <h2>The Forgotten Realms</h2>
      <button class="btn-close" data-action="close-details">×</button>
    </div>

    <!-- Conditions -->
    <div class="details-section">
      <h3>Conditions</h3>
      <div class="conditions-grid">
        <div class="condition-item">
          <span class="condition-icon">🌙</span>
          <span class="condition-label">Time</span>
          <span class="condition-value">Night (14:30)</span>
        </div>
        <div class="condition-item">
          <span class="condition-icon">🌧️</span>
          <span class="condition-label">Weather</span>
          <span class="condition-value">Rainy</span>
        </div>
        <div class="condition-item">
          <span class="condition-icon">🍂</span>
          <span class="condition-label">Season</span>
          <span class="condition-value">Autumn</span>
        </div>
        <div class="condition-item">
          <span class="condition-icon">🌡️</span>
          <span class="condition-label">Temperature</span>
          <span class="condition-value">Cool (12°C)</span>
        </div>
      </div>

      <div class="global-modifiers">
        <h4>Global Modifiers</h4>
        <ul>
          <li>+10% Stealth (Darkness)</li>
          <li>-20% Fire Damage (Rain)</li>
          <li>+5% Movement Speed (Autumn)</li>
        </ul>
      </div>
    </div>

    <!-- Lore -->
    <div class="details-section">
      <h3>Lore</h3>
      <div class="lore-content">
        <p>A high fantasy world where magic flows through the land...</p>
        <button class="btn-secondary" data-action="edit-lore">Edit Lore</button>
      </div>
    </div>

    <!-- Settings -->
    <div class="details-section">
      <h3>Settings</h3>
      <div class="settings-form">
        <div class="form-group">
          <label>World Name</label>
          <input type="text" value="The Forgotten Realms">
        </div>
        <div class="form-group">
          <label>World Style</label>
          <select>
            <option value="fantasy" selected>Fantasy</option>
            <option value="real">Realistic</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="scifi">Sci-Fi</option>
          </select>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea>A high fantasy world with magic and dragons...</textarea>
        </div>
        <button class="btn-primary" data-action="save-settings">Save Settings</button>
      </div>
    </div>
  </div>
</div>
```

### CSS Styles

```css
/* World dashboard layout */
.world-dashboard {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 1rem;
  height: 100%;
}

.dashboard-header {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

/* World list */
.world-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.world-card {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.world-card:hover {
  border-color: var(--accent-primary);
}

.world-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary);
}

.world-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.world-icon {
  font-size: 2rem;
}

.world-style {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.world-info h3 {
  margin: 0 0 0.25rem 0;
}

.world-description {
  margin: 0 0 0.5rem 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.world-stats {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.world-conditions {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.condition {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.world-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* World details panel */
.world-details-panel {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 1rem;
  overflow-y: auto;
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-default);
}

.details-section {
  margin-bottom: 1.5rem;
}

.details-section h3 {
  margin: 0 0 1rem 0;
}

.conditions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.condition-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

.condition-icon {
  font-size: 1.25rem;
}

.condition-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.condition-value {
  font-weight: 600;
}

.global-modifiers h4 {
  margin: 0 0 0.5rem 0;
}

.global-modifiers ul {
  margin: 0;
  padding-left: 1.5rem;
}

.global-modifiers li {
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .world-dashboard {
    grid-template-columns: 1fr;
  }

  .world-details-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 400px;
    z-index: 100;
    transform: translateX(100%);
    transition: transform 0.3s ease;
  }

  .world-details-panel.open {
    transform: translateX(0);
  }

  .world-card {
    grid-template-columns: 1fr;
  }

  .world-preview {
    flex-direction: row;
    gap: 1rem;
  }

  .world-conditions {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .world-actions {
    flex-direction: row;
  }
}
```

## Files to Create

- `src/frontend/world/world-dashboard.ts`
- `src/frontend/world/world-dashboard.css`
- `src/frontend/alpine/world-dashboard.ts`

## Related Tasks

- TASK-location-explorer.md
- TASK-travel-interface.md
- TASK-time-weather-widget.md

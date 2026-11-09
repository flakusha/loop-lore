// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy interface — phase dispatcher (EPIC-NSFW-UI Phase 1).
 *
 * Maps the flow state's phase onto the per-phase DOM builders in
 * `intimacy-phases.ts`. The Alpine mixin (`src/frontend/alpine/nsfw-intimacy`)
 * owns flow state and mounts the returned section into the
 * `x-ref="intimacyPanel"` slot of
 * `src/components/chat/intimacy-panel.html`.
 */

import {
  type IntimacyPanelHandlers,
  renderActionSelect,
  renderApplying,
  renderConfirmConsent,
  renderEffects,
  renderError,
  renderIdle,
  renderPartnerSelect,
  renderPositionSelect,
} from "./intimacy-phases";
import type { IntimacyFlowState, } from "./intimacy-types";

/**
 * Render the intimacy panel for the current flow state. The idle phase
 * renders only the open trigger (mirroring body-state's render-nothing
 * convention for empty views).
 * @param state - current flow state
 * @param options - render options
 * @param options.partners - selectable partner options (partnerSelect phase)
 * @param options.pairScore - current pair score for the action grid
 * @param options.handlers - click handlers
 * @returns {HTMLElement} the section element (never null — idle is the trigger)
 */
export function renderIntimacyPanel(
  state: IntimacyFlowState,
  options: { partners: { actorId: string; displayName: string }[]; pairScore: number; handlers: IntimacyPanelHandlers },
): HTMLElement {
  switch (state.phase) {
    case "idle": {
      return renderIdle(options.handlers,);
    }

    case "partnerSelect": {
      return renderPartnerSelect(state, options.partners, options.handlers,);
    }

    case "positionSelect": {
      return renderPositionSelect(state, options.handlers,);
    }

    case "actionSelect": {
      return renderActionSelect(options.pairScore, options.handlers,);
    }

    case "confirmConsent": {
      return renderConfirmConsent(state, options.handlers,);
    }

    case "applying": {
      return renderApplying();
    }

    case "effects": {
      return renderEffects(state, options.handlers,);
    }

    case "error": {
      return renderError(state, options.handlers,);
    }
  }
}

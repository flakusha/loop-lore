// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Avatar Centerer — Alpine data factory (TASK-001).
 *
 * The math is intentionally trivial: anchor the slot at the host's
 * geometric center using translate(-50%, -50%) and read window
 * dimensions once per resize. We DO NOT animate the transform —
 * applying a single style mutation is the same end state for
 * reduced-motion users as for everyone else.
 *
 * Centered range: 360px -> 1920px (clamp). Outside that range the
 * viewport edge wins (the host CSS handles the actual edge pinning).
 */

export interface AvatarCentererState {
  centerStyle: string;
  recompute(): void;
}

const SAFE_PAD_PX = 12;

/**
 * Build the inline style for the avatar centerer host.
 *
 * @param vw - current viewport width in CSS pixels
 * @param vh - current viewport height in CSS pixels
 */
function buildCenterStyle(vw: number, vh: number,): string {
  const padX = Math.min(SAFE_PAD_PX, Math.max(0, (vw - 360) / 4,),);
  const padY = Math.min(SAFE_PAD_PX, Math.max(0, (vh - 480) / 6,),);
  // The centerer positions itself absolutely inside its parent.
  // translate(-50%, -50%) lines the slot center up with parent center.
  return [
    `position: absolute`,
    `left: calc(50% + 0px)`,
    `top: calc(50% + 0px)`,
    `transform: translate(-50%, -50%)`,
    `max-width: calc(100% - ${padX * 2}px)`,
    `max-height: calc(100% - ${padY * 2}px)`,
    `--avatar-safe-pad: ${SAFE_PAD_PX}px`,
  ].join("; ",);
}

/**
 * @param host - window-like object (defaults to globalThis) — passed
 *   through so tests can stub window dimensions without touching the
 *   real DOM.
 */
export function avatarCenterer(host?: { innerWidth: number; innerHeight: number },): AvatarCentererState {
  const w = host ?? (globalThis as unknown as { innerWidth: number; innerHeight: number });
  return {
    centerStyle: buildCenterStyle(w.innerWidth, w.innerHeight,),
    recompute() {
      this.centerStyle = buildCenterStyle(w.innerWidth, w.innerHeight,);
    },
  };
}

type AvatarCentererFactory = typeof avatarCenterer;
declare global {
  // Ambient registration consumed by Alpine x-data="avatarCenterer()".
  // eslint-disable-next-line no-var
  var avatarCenterer: AvatarCentererFactory;
}

(globalThis as unknown as { avatarCenterer: typeof avatarCenterer }).avatarCenterer = avatarCenterer;

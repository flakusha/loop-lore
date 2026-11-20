// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * session-store.ts — the in-memory index of remembered harness sessions.
 *
 * Pure: no IO, no clock, no framework. One instance per test (never a
 * process-wide map — two parallel tests must not share it). The adapter's
 * `listSessions`/`resumeSession`/`loadSession` talk to the harness; this
 * store is loop-lore's side of the binding: profile → remembered sessions.
 */

/** One remembered harness session. */
export interface StoredHarnessSession {
  /** The harness's session id (`session/new` `sessionId`). */
  sessionId: string;
  /** The cwd the session runs in. */
  cwd: string;
}

/** One remembered session with the profile that owns it. */
export interface StoredHarnessSessionEntry extends StoredHarnessSession {
  /** The profile that established the session. */
  profile: string;
}

/**
 * Profile → remembered sessions, in remember order. An entry for a known
 * session id refreshes its cwd in place.
 */
export class HarnessSessionStore {
  private readonly sessions = new Map<string, StoredHarnessSession[]>();

  /**
   * Remember a session for a profile.
   * @param profile - the profile that established the session
   * @param sessionId - the harness's session id
   * @param cwd - the cwd the session runs in
   */
  remember(profile: string, sessionId: string, cwd: string,): void {
    const known = this.sessions.get(profile,) ?? [];
    const entry = known.find((candidate,) => candidate.sessionId === sessionId);
    if (entry) {
      entry.cwd = cwd;
      return;
    }

    known.push({ sessionId, cwd, },);
    this.sessions.set(profile, known,);
  }

  /**
   * Sessions remembered for one profile, in remember order.
   * @param profile - the profile to list
   * @returns the profile's sessions (a copy).
   */
  sessionsFor(profile: string,): StoredHarnessSession[] {
    return (this.sessions.get(profile,) ?? []).map((entry,) => ({ ...entry, }));
  }

  /**
   * Every remembered session with its owning profile.
   * @returns all entries, profiles in first-remember order.
   */
  list(): StoredHarnessSessionEntry[] {
    const entries: StoredHarnessSessionEntry[] = [];
    for (const [profile, known,] of this.sessions) {
      for (const entry of known) { entries.push({ profile, ...entry, },); }
    }

    return entries;
  }
}

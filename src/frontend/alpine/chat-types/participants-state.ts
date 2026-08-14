import type { AlpineMagicThis, } from "../types";

/** A participant row as returned by GET /api/v1/chats/:id/participants. */
export interface ChatParticipant {
  chat_id: string;
  actor_id: string;
  role_in_chat: string;
  talkativity: number;
  initiative: number;
  joined_at: string;
  last_read_message_id: string | null;
  impersonate_actor_id: string | null;
  persona_id: string | null;
  display_name: string;
  actor_type: string;
}

/** An actor the current user can add to a group chat. */
export interface AvailableActor {
  id: string;
  display_name: string;
  actor_type: string;
}

/**
 * Group-chat participant panel state (C1 — chat-type matrix UI remainder).
 *
 * Backed by the existing participants REST API (GET/POST/PUT/DELETE
 * /api/v1/chats/:id/participants). `loadParticipants()` also keeps
 * `_chatParticipants` in sync so @mention autocomplete keeps working.
 */
export interface ChatParticipantsState extends AlpineMagicThis {
  /** Full participant rows (with talkativity/initiative) for the active group chat. */
  _participants: ChatParticipant[];
  /** Actors the user owns and can add to the group. */
  _availableActors: AvailableActor[];
  /** Filter text for the "add participant" actor picker. */
  _participantQuery: string;
  /** True while an add/remove/update request is in flight. */
  _participantsBusy: boolean;
  /** Actor id selected in the add-participant picker. */
  _selectedAddActorId: string | null;
  /** Role selected in the add-participant picker. */
  _selectedAddRole: string;

  /** True when the active chat is a group chat. */
  readonly isGroupChat: boolean;
  /** Available actors filtered by `_participantQuery`, excluding current members. */
  readonly filteredAvailableActors: AvailableActor[];

  /** Load participants for the active chat; also refreshes `_chatParticipants`. */
  loadParticipants(): Promise<void>;
  /** Load the current user's addable actors. */
  loadAvailableActors(): Promise<void>;
  /** Add an actor to the group (POST /participants). */
  addParticipant(actorId: string, role?: string,): Promise<void>;
  /** Remove an actor from the group (DELETE /participants/:actorId). */
  removeParticipant(actorId: string,): Promise<void>;
  /** Update a participant's talkativity (PUT /participants/:actorId). */
  updateParticipantTalkativity(actorId: string, value: number,): Promise<void>;
  /** Update a participant's initiative (PUT /participants/:actorId). */
  updateParticipantInitiative(actorId: string, value: number,): Promise<void>;
}

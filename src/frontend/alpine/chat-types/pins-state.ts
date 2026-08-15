/** A pinned message row returned by the pins API. */
export interface ChatPinRow {
  id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
  content: string;
  role: string;
  display_name: string | null;
}

/** Chat pins state (pin/unpin/list pinned messages). */
export interface ChatPinsState {
  _pins: ChatPinRow[];
  _pinsLoading: boolean;
  _pinsOpen: boolean;
  togglePinsPanel(): void;
  loadPins(): Promise<void>;
  pinMessage(messageId: string,): Promise<void>;
  unpinMessage(pinId: string,): Promise<void>;
  scrollToPinnedMessage(messageId: string,): void;
}

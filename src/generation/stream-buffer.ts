/**
 * Stream Buffer — per-chat ring buffer for SSE events
 *
 * Each chat gets a StreamBuffer that stores HTML events for replay
 * on SSE reconnect. Live subscribers receive new events in real-time.
 *
 * Events are trimmed by count and byte size when limits exceeded.
 */

// ── Types ──────────────────────────────────────────────────

export interface StreamEvent {
  type: string;
  html: string;
  sequence: number;
}

type EventSubscriber = (event: StreamEvent,) => void;
type DoneSubscriber = () => void;
type ErrorSubscriber = (error: string,) => void;

// ── Buffer ─────────────────────────────────────────────────

const MAX_EVENTS = 500;
const MAX_BYTES = 1_048_576; // 1 MB

export class StreamBuffer {
  private events: StreamEvent[] = [];
  private sequence = 0;
  private bytesUsed = 0;
  private _done = false;
  private _error: string | null = null;
  private readonly onEvent = new Set<EventSubscriber>();
  private readonly onDone = new Set<DoneSubscriber>();
  private readonly onError = new Set<ErrorSubscriber>();

  /** Append an event to the buffer. Returns sequence number for replay tracking. */
  append(type: string, html: string,): number {
    const seq = this.sequence++;
    const event: StreamEvent = { type, html, sequence: seq, };
    this.events.push(event,);
    this.bytesUsed += html.length;

    // Trim oldest when over limit
    while (this.events.length > MAX_EVENTS || this.bytesUsed > MAX_BYTES) {
      const removed = this.events.shift()!;
      this.bytesUsed -= removed.html.length;
    }

    for (const sub of this.onEvent) { sub(event,); }
    return seq;
  }

  /** Signal generation completed successfully */
  signalDone(): void {
    this._done = true;
    for (const sub of this.onDone) { sub(); }
  }

  /** Signal generation failed */
  signalError(error: string,): void {
    this._error = error;
    for (const sub of this.onError) { sub(error,); }
  }

  /** Replay events from a given sequence number (0 = all) */
  replay(fromSequence = 0,): StreamEvent[] {
    return this.events.filter((e,) => e.sequence >= fromSequence);
  }

  /** Subscribe to live events. Returns unsubscribe function. */
  subscribe(cb: EventSubscriber, onDone?: DoneSubscriber, onError?: ErrorSubscriber,): () => void {
    this.onEvent.add(cb,);
    if (onDone) { this.onDone.add(onDone,); }
    if (onError) { this.onError.add(onError,); }
    return () => {
      this.onEvent.delete(cb,);
      if (onDone) { this.onDone.delete(onDone,); }
      if (onError) { this.onError.delete(onError,); }
    };
  }

  get isDone(): boolean {
    return this._done;
  }

  get hasError(): string | null {
    return this._error;
  }

  get isEmpty(): boolean {
    return this.events.length === 0;
  }

  get currentSequence(): number {
    return this.sequence;
  }
}

// ── Global store ──────────────────────────────────────────

const MAX_BUFFERS = 1000;
const chatBuffers = new Map<string, StreamBuffer>();
const bufferAccessOrder: string[] = [];

/** Move chatId to end of access order (most recently used) */
function touchBuffer(chatId: string,): void {
  const idx = bufferAccessOrder.indexOf(chatId,);
  if (idx !== -1) { bufferAccessOrder.splice(idx, 1,); }
  bufferAccessOrder.push(chatId,);
}

/** Evict least recently used buffer when over limit */
function evictOldestBuffer(): void {
  if (chatBuffers.size <= MAX_BUFFERS) { return; }
  const oldest = bufferAccessOrder.shift();
  if (oldest) { chatBuffers.delete(oldest,); }
}

/** Get or create a buffer for the given chat */
export function getOrCreateBuffer(chatId: string,): StreamBuffer {
  let buf = chatBuffers.get(chatId,);
  if (!buf) {
    evictOldestBuffer();
    buf = new StreamBuffer();
    chatBuffers.set(chatId, buf,);
  }
  touchBuffer(chatId,);
  return buf;
}

/** Get existing buffer (undefined if none) */
export function getBuffer(chatId: string,): StreamBuffer | undefined {
  const buf = chatBuffers.get(chatId,);
  if (buf) { touchBuffer(chatId,); }
  return buf;
}

/** Remove a buffer */
export function removeBuffer(chatId: string,): void {
  chatBuffers.delete(chatId,);
  const idx = bufferAccessOrder.indexOf(chatId,);
  if (idx !== -1) { bufferAccessOrder.splice(idx, 1,); }
}

/** Schedule buffer cleanup after a TTL */
export function scheduleBufferCleanup(chatId: string, ttlMs = 300_000,): void {
  setTimeout(() => {
    removeBuffer(chatId,);
  }, ttlMs,).unref();
}

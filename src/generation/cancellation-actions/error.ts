import type { CancelReason, CancelSource, } from "../../db/enums";

/**
 * Custom error thrown when an active generation is cancelled.
 */
export class GenerationCancelledError extends Error {
  readonly reason: CancelReason;
  readonly source: CancelSource;
  readonly detail: string;

  constructor(reason: CancelReason, source: CancelSource, detail: string, options?: ErrorOptions,) {
    super(`Generation cancelled: ${reason} (${source}) — ${detail}`, options,);
    this.name = "GenerationCancelledError";
    this.reason = reason;
    this.source = source;
    this.detail = detail;
  }
}

/**
 * Key rotation result/summary types.
 */

export interface RotationResult {
  actorId: string;
  oldKeyId: string;
  newKeyId: string;
  chatsAffected: number;
  messagesReEncrypted: number;
}

export interface RotationSummary {
  checked: number;
  rotated: number;
  results: RotationResult[];
  errors: string[];
}

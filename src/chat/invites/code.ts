import { randomBytes, } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
const CODE_LENGTH = 8;

/** Generate a short, human-friendly invite code. */
export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH,);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return code;
}

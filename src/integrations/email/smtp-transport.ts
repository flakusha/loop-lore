// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 340

/**
 * src/integrations/email/smtp-transport.ts — the real SMTP byte transport
 * behind the EmailTransport seam (federation-email-channel.md §8.3).
 *
 * Stdlib-only on purpose: nodemailer remains a lazy opt-in dependency, so
 * production MFA mail needs a working transport without new packages.
 * Implicit TLS on 465, STARTTLS everywhere else; AUTH is only attempted on
 * a TLS connection (fail closed — no credentials on the wire without TLS).
 */
import * as net from "node:net";
import * as tls from "node:tls";
import type { EmailTransport, EmailTransportMessage, } from "./adapter";

/** Per-command timeout when none is supplied. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Options for {@link createSmtpTransport}. */
export interface SmtpTransportOptions {
  /** SMTP host. */
  host: string;
  /** SMTP port; implicit TLS by default on 465, STARTTLS on other ports unless {@link implicitTls} overrides. */
  port: number;
  /** Force implicit TLS (SMTPS) regardless of port. Defaults to port === 465. */
  implicitTls?: boolean;
  /** SMTP username (AUTH identity and envelope sender). */
  user: string;
  /** SMTP password. */
  password: string;
  /** Per-command timeout in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Skip certificate-chain verification (self-signed internal relays).
   * Defaults to true (verify) — production never turns this off. */
  rejectUnauthorized?: boolean;
}

/** One parsed SMTP reply (all lines of a possibly-multiline response). */
interface SmtpReply {
  /** Code of the final reply line. */
  code: number;
  /** Every line, including 250- continuations. */
  lines: string[];
}

/** Outstanding request/response pair. */
interface PendingReply {
  resolve: (reply: SmtpReply,) => void;
  reject: (error: Error,) => void;
}

/** A live SMTP connection: strictly one outstanding command at a time. */
interface SmtpSession {
  /** Read the unsolicited 220 greeting. */
  greeting(): Promise<SmtpReply>;
  /** Send a command; require one of `expected` codes. */
  command(line: string, expected: readonly number[],): Promise<SmtpReply>;
  /** Read the reply to an already-written DATA payload. */
  reply(): Promise<SmtpReply>;
  /** Send STARTTLS, require 220, then upgrade; caller must EHLO again. */
  startTls(): Promise<void>;
  /** Write the framed, dot-stuffed DATA payload. */
  writeData(payload: string,): void;
  /** Best-effort QUIT, then full socket/listener/timer teardown. */
  close(): void;
}

/** Strip CR/LF from a value bound for a header or envelope (injection guard). */
function stripCrlf(value: string,): string {
  return value.replace(/[\r\n]+/g, " ",);
}

/** Build the RFC 5322 payload with CRLF endings and dot-stuffed body lines. */
function frame(message: EmailTransportMessage,): string {
  const headers = [
    `From: ${stripCrlf(message.from,)}`,
    `To: ${stripCrlf(message.to,)}`,
    ...(message.subject ? [`Subject: ${stripCrlf(message.subject,)}`,] : []),
  ].join("\r\n",);

  const body = message.body.replace(/\r?\n$/, "",).split(/\r?\n/,)
    .map((line,) => line.startsWith(".",) ? `.${line}` : line)
    .join("\r\n",);

  return `${headers}\r\n\r\n${body}\r\n.\r\n`;
}

/** Wrap a connected socket in the strictly-sequential SMTP reply state machine. */
function openSession(
  initial: net.Socket | tls.TLSSocket,
  options: SmtpTransportOptions,
): SmtpSession {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const verify = { rejectUnauthorized: options.rejectUnauthorized ?? true, };
  let socket = initial;
  let buffer = "";
  let lines: string[] = [];
  const queued: SmtpReply[] = [];
  let pending: PendingReply | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer,);
      timer = undefined;
    }
  };

  const fail = (error: Error,): void => {
    clearTimer();
    const p = pending;
    pending = undefined;
    p?.reject(error,);
  };

  const onData = (chunk: Buffer,): void => {
    buffer += chunk.toString("utf8",);
    let nl: number;
    while ((nl = buffer.indexOf("\r\n",)) !== -1) {
      const line = buffer.slice(0, nl,);
      buffer = buffer.slice(nl + 2,);
      const code = /^\d{3}/.test(line,) ? Number.parseInt(line.slice(0, 3,), 10,) : undefined;
      if (code === undefined) {
        fail(new Error(`SMTP: malformed reply "${line}"`,),);
        socket.destroy();
        return;
      }

      lines.push(line,);
      // A continuation line has '-' at index 3; the final line has ' ' or ends.
      if (line.length === 3 || line[3] === " ") {
        const reply: SmtpReply = { code, lines, };
        lines = [];
        if (pending !== undefined) {
          clearTimer();
          const p = pending;
          pending = undefined;
          p.resolve(reply,);
        } else {
          queued.push(reply,);
        }
      }
    }
  };

  const onError = (error: Error,): void => {
    fail(error,);
  };

  const onClose = (): void => {
    fail(new Error("SMTP connection closed before reply",),);
  };

  const attach = (s: net.Socket | tls.TLSSocket,): void => {
    s.on("data", onData,);
    s.on("error", onError,);
    s.on("close", onClose,);
  };

  const detach = (s: net.Socket | tls.TLSSocket,): void => {
    s.off("data", onData,);
    s.off("error", onError,);
    s.off("close", onClose,);
  };

  attach(socket,);

  const reply = (): Promise<SmtpReply> => {
    const ready = queued.shift();
    if (ready !== undefined) { return Promise.resolve(ready,); }
    if (pending !== undefined) {
      return Promise.reject(new Error("SMTP: a command is already pending",),);
    }

    const { promise, resolve, reject, } = Promise.withResolvers<SmtpReply>();
    pending = { resolve, reject, };
    timer = setTimeout(() => {
      fail(new Error(`SMTP command timed out after ${timeoutMs}ms`,),);
      socket.destroy();
    }, timeoutMs,);

    return promise;
  };

  const command = async (
    line: string,
    expected: readonly number[],
  ): Promise<SmtpReply> => {
    socket.write(`${line}\r\n`,);
    const result = await reply();
    if (!expected.includes(result.code,)) {
      throw new Error(
        `SMTP ${line.split(" ",)[0]}: expected ${expected.join("/",)}, got ${result.code} (${result.lines[0] ?? ""})`,
      );
    }

    return result;
  };

  return {
    greeting: () => reply(),
    reply,
    command,
    async startTls() {
      await command("STARTTLS", [220,],);
      detach(socket,);
      const plain = socket;
      const upgraded = tls.connect({
        socket: plain,
        servername: net.isIP(options.host,) === 0 ? options.host : undefined,
        ...verify,
      },);

      const { promise, resolve, reject, } = Promise.withResolvers<void>();
      const handshakeTimer = setTimeout(() => {
        cleanup();
        upgraded.destroy();
        reject(new Error(`SMTP STARTTLS handshake timed out after ${timeoutMs}ms`,),);
      }, timeoutMs,);

      const onReady = (): void => {
        cleanup();
        resolve();
      };

      const onFail = (error: Error,): void => {
        cleanup();
        reject(error,);
      };

      const cleanup = (): void => {
        clearTimeout(handshakeTimer,);
        upgraded.off("secureConnect", onReady,);
        upgraded.off("error", onFail,);
      };

      upgraded.once("secureConnect", onReady,);
      upgraded.once("error", onFail,);
      try {
        await promise;
      } catch (error) {
        upgraded.destroy();
        throw error;
      }

      socket = upgraded;
      buffer = "";
      lines = [];
      attach(socket,);
    },
    writeData(payload,) {
      socket.write(payload,);
    },
    close() {
      clearTimer();
      const s = socket;
      detach(s,);
      if (!s.destroyed) {
        s.on("error", () => undefined,); // swallow teardown write errors
        s.end("QUIT\r\n",);
      }

      pending = undefined;
      queued.length = 0;
    },
  };
}

/** Wait for a fresh TCP (or implicit-TLS) connection to the SMTP server. */
function connect(
  options: SmtpTransportOptions,
): Promise<net.Socket | tls.TLSSocket> {
  const implicit = options.implicitTls ?? options.port === 465;
  const socket = implicit
    ? tls.connect({
      host: options.host,
      port: options.port,
      servername: net.isIP(options.host,) === 0 ? options.host : undefined,
      rejectUnauthorized: options.rejectUnauthorized ?? true,
    },)
    : net.connect({ host: options.host, port: options.port, },);

  const ready = implicit ? "secureConnect" : "connect";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { promise, resolve, reject, } = Promise.withResolvers<net.Socket | tls.TLSSocket>();
  const timer = setTimeout(() => {
    cleanup();
    socket.destroy();
    reject(new Error(`SMTP connect timed out after ${timeoutMs}ms`,),);
  }, timeoutMs,);

  const onReady = (): void => {
    cleanup();
    resolve(socket,);
  };

  const onError = (error: Error,): void => {
    cleanup();
    socket.destroy();
    reject(error,);
  };

  const cleanup = (): void => {
    clearTimeout(timer,);
    socket.off(ready, onReady,);
    socket.off("error", onError,);
  };

  socket.once(ready, onReady,);
  socket.once("error", onError,);
  return promise;
}

/**
 * Build a real SMTP transport for MFA/mail delivery.
 *
 * @param options Connection and credentials; see {@link SmtpTransportOptions}.
 * @returns An EmailTransport whose `send` resolves with "" (the adapter
 *   synthesizes a Message-ID).
 * @throws {Error} If connecting, TLS negotiation, AUTH or any command fails;
 *   all failures reject the `send` promise, not construction.
 */
export function createSmtpTransport(options: SmtpTransportOptions,): EmailTransport {
  return {
    async send(message,) {
      const implicit = options.implicitTls ?? options.port === 465;
      const socket = await connect(options,);
      const session = openSession(socket, options,);
      try {
        const greeting = await session.greeting();
        if (greeting.code !== 220) {
          throw new Error(
            `SMTP greeting rejected: ${greeting.code} ${greeting.lines[0] ?? ""}`,
          );
        }

        let ehlo = await session.command("EHLO localhost", [250,],);
        if (!implicit) {
          const hasStarttls = ehlo.lines.some(
            (line,) => line.slice(4,).trim().toUpperCase().startsWith("STARTTLS",),
          );

          if (!hasStarttls) {
            throw new Error(
              "SMTP server does not advertise STARTTLS; refusing to send credentials",
            );
          }

          await session.startTls();
          ehlo = await session.command("EHLO localhost", [250,],);
        }

        const authLine = ehlo.lines
          .map((line,) => line.slice(4,).trim())
          .find((line,) => /^AUTH[ =]/i.test(line,)) ?? "";

        if (/\bPLAIN\b/i.test(authLine,)) {
          const token = Buffer.from(`\0${options.user}\0${options.password}`, "utf8",)
            .toString("base64",);

          await session.command(`AUTH PLAIN ${token}`, [235,],);
        } else if (/\bLOGIN\b/i.test(authLine,)) {
          await session.command("AUTH LOGIN", [334,],);
          await session.command(Buffer.from(options.user, "utf8",).toString("base64",), [334,],);
          await session.command(Buffer.from(options.password, "utf8",).toString("base64",), [235,],);
        } else {
          throw new Error("SMTP server advertises no supported AUTH mechanism (PLAIN/LOGIN)",);
        }

        await session.command(`MAIL FROM:<${stripCrlf(options.user,)}>`, [250,],);
        await session.command(`RCPT TO:<${stripCrlf(message.to,)}>`, [250, 251,],);
        await session.command("DATA", [354,],);
        session.writeData(frame(message,),);
        const queued = await session.reply();
        if (queued.code !== 250) {
          throw new Error(`SMTP DATA rejected: ${queued.code} ${queued.lines[0] ?? ""}`,);
        }

        return "";
      } finally {
        session.close();
      }
    },
  };
}

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SMTP transport against a local fake server (node:net + a TLS upgrade).
 * Resource contract: each test owns one ephemeral loopback TCP port and one
 * fake server, released in withFake's finally. The only shared inputs are the
 * read-only committed cert fixtures. No globals or ordering dependence —
 * safe under --isolate and in parallel.
 */
import { describe, expect, test, } from "bun:test";
import * as net from "node:net";
import * as tls from "node:tls";
import { createSmtpTransport, } from "./smtp-transport";

// Self-signed test cert already committed for the federation SPKI probe.
const FIXTURE_DIR = new URL("../../federation/spki-pin-fixture/", import.meta.url,);
const CERT = await Bun.file(new URL("leaf.pem", FIXTURE_DIR,),).text();
const KEY = await Bun.file(new URL("leaf.key.pem", FIXTURE_DIR,),).text();

/** Knobs for the fake server's reply behaviour. */
interface FakeOptions {
  /** Omit STARTTLS from EHLO capabilities. Default true (advertise it). */
  advertiseStarttls?: boolean;
  /** AUTH mechanisms advertised after TLS. Default "PLAIN LOGIN". */
  authMechanisms?: string;
  /** Serve TLS from the first byte (implicit TLS) instead of STARTTLS. */
  implicitTls?: boolean;
  /** Override the initial greeting line (used for non-2xx failures). */
  greeting?: string;
  /** Reject MAIL FROM with 550. */
  rejectMail?: boolean;
  /** Accept STARTTLS but never complete the TLS handshake. */
  stallTls?: boolean;
}

/** Observations collected by the fake server. */
interface FakeState {
  authLines: string[];
  authBeforeTls: boolean;
  dataRaw: string[];
  sawStarttls: boolean;
  sawTls: boolean;
}

/** A running fake SMTP server. */
interface FakeSmtp {
  port: number;
  state: FakeState;
  close(): Promise<void>;
}

/** Serve one connection, upgrading in place on STARTTLS. */
function serve(
  socket: net.Socket | tls.TLSSocket,
  opts: FakeOptions,
  state: FakeState,
  upgraded: boolean,
): void {
  let buffer = "";
  let inData = false;
  let data = "";
  let switched = false;
  let loginStep = 0;

  const onData = (chunk: Buffer,): void => {
    // latin1 preserves each byte so CRLF/dot-stuffing can be asserted verbatim.
    buffer += chunk.toString("latin1",);
    let nl: number;
    while ((nl = buffer.indexOf("\n",)) !== -1) {
      const raw = buffer.slice(0, nl + 1,);
      buffer = buffer.slice(nl + 1,);
      if (inData) {
        data += raw;
        if (raw === ".\r\n") {
          inData = false;
          state.dataRaw.push(data,);
          data = "";
          socket.write("250 2.0.0 OK queued\r\n",);
        }

        continue;
      }

      const line = raw.endsWith("\r\n",)
        ? raw.slice(0, -2,)
        : raw.slice(0, -1,);

      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO",) || upper.startsWith("HELO",)) {
        socket.write(
          opts.advertiseStarttls === false || upgraded
            ? `250-fake\r\n250 AUTH ${opts.authMechanisms ?? "PLAIN LOGIN"}\r\n`
            : "250-fake\r\n250-STARTTLS\r\n250 HELP\r\n",
        );
      } else if (upper === "STARTTLS" && !upgraded) {
        state.sawStarttls = true;
        if (opts.stallTls === true) {
          socket.write("220 2.0.0 Ready to start TLS\r\n",);
          socket.off("data", onData,);
          return;
        }

        switched = true;
        socket.write("220 2.0.0 Ready to start TLS\r\n", () => {
          socket.off("data", onData,);
          socket.off("error", onError,);
          socket.off("close", onClose,);
          const secure = new tls.TLSSocket(socket, {
            isServer: true,
            key: KEY,
            cert: CERT,
          },);

          state.sawTls = true;
          serve(secure, opts, state, true,);
        },);

        return;
      } else if (upper === "AUTH LOGIN") {
        state.authLines.push(line,);
        if (!upgraded) { state.authBeforeTls = true; }
        loginStep = 1;
        socket.write("334 VXNlcm5hbWU6\r\n",);
      } else if (loginStep > 0) {
        state.authLines.push(line,);
        if (loginStep === 1) {
          loginStep = 2;
          socket.write("334 UGFzc3dvcmQ6\r\n",);
        } else {
          loginStep = 0;
          socket.write("235 2.7.0 Authentication successful\r\n",);
        }
      } else if (upper.startsWith("AUTH",)) {
        state.authLines.push(line,);
        if (!upgraded) { state.authBeforeTls = true; }
        socket.write("235 2.7.0 Authentication successful\r\n",);
      } else if (upper.startsWith("MAIL FROM",)) {
        socket.write(
          opts.rejectMail === true
            ? "550 5.1.0 Mail rejected\r\n"
            : "250 2.1.0 OK\r\n",
        );
      } else if (upper.startsWith("RCPT TO",)) {
        socket.write("250 2.1.5 OK\r\n",);
      } else if (upper === "DATA") {
        inData = true;
        data = "";
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n",);
      } else if (upper === "QUIT") {
        socket.write("221 2.0.0 Bye\r\n",);
        socket.end();
      } else {
        socket.write("500 5.5.2 Unknown command\r\n",);
      }

      if (switched) { return; }
    }
  };

  const onError = (): void => {/* peer vanished */};
  const onClose = (): void => {/* peer vanished */};
  socket.on("data", onData,);
  socket.on("error", onError,);
  socket.on("close", onClose,);

  if (!upgraded) { socket.write(opts.greeting ?? "220 fake ESMTP\r\n",); }
}

/** Bind a fake SMTP server on an ephemeral loopback port. */
async function startFake(opts: FakeOptions = {},): Promise<FakeSmtp> {
  const state: FakeState = {
    authLines: [],
    authBeforeTls: false,
    dataRaw: [],
    sawStarttls: false,
    sawTls: false,
  };

  const server = opts.implicitTls === true
    ? tls.createServer({ key: KEY, cert: CERT, }, (socket,) => {
      state.sawTls = true;
      socket.write(opts.greeting ?? "220 fake ESMTP\r\n",);
      serve(socket, opts, state, true,);
    },)
    : net.createServer((socket,) => {
      serve(socket, opts, state, false,);
    },);

  const { promise, resolve, } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve,);
  await promise;
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    state,
    async close() {
      const { promise, resolve, } = Promise.withResolvers<void>();
      server.close(() => resolve());
      await promise;
    },
  };
}

/** Run a callback against a fake server, always tearing it down. */
async function withFake<T,>(
  opts: FakeOptions,
  run: (fake: FakeSmtp,) => Promise<T>,
): Promise<T> {
  const fake = await startFake(opts,);
  try {
    return await run(fake,);
  } finally {
    await fake.close();
  }
}

/** Transport bound to a fake server (TLS verification off for the test cert). */
function transportFor(port: number, implicitTls = false,) {
  return createSmtpTransport({
    host: "127.0.0.1",
    port,
    implicitTls,
    user: "bot@example.com",
    password: "s3cret",
    timeoutMs: 2_000,
    rejectUnauthorized: false,
  },);
}

const MESSAGE = {
  from: "bot@example.com",
  to: "user@example.com",
  body: "line one\n.line two\n..third",
};

describe("createSmtpTransport", () => {
  test("sends over STARTTLS with AUTH PLAIN and a dot-stuffed CRLF body", async () => {
    await withFake({}, async (fake,) => {
      const id = await transportFor(fake.port,).send(MESSAGE,);
      expect(id,).toBe("",);
      expect(fake.state.sawStarttls,).toBe(true,);
      expect(fake.state.sawTls,).toBe(true,);
      expect(fake.state.authBeforeTls,).toBe(false,);
      expect(fake.state.authLines,).toHaveLength(1,);

      const token = fake.state.authLines[0]?.split(" ",)[2] ?? "";
      expect(Buffer.from(token, "base64",).toString("utf8",),)
        .toBe("\0bot@example.com\0s3cret",);

      const payload = fake.state.dataRaw[0] ?? "";
      expect(payload,).toContain("From: bot@example.com\r\n",);
      expect(payload,).toContain("To: user@example.com\r\n",);
      expect(payload,).toContain("line one\r\n..line two\r\n...third\r\n",);
      expect(payload.endsWith("\r\n.\r\n",),).toBe(true,);
      expect(payload.replace(/\r\n/g, "",),).not.toContain("\n",);
    },);
  });

  test("refuses to send credentials when STARTTLS is not advertised", async () => {
    await withFake({ advertiseStarttls: false, }, async (fake,) => {
      await expect(transportFor(fake.port,).send(MESSAGE,),)
        .rejects.toThrow(/STARTTLS/,);

      expect(fake.state.authLines,).toHaveLength(0,);
      expect(fake.state.authBeforeTls,).toBe(false,);
    },);
  });

  test("rejects a non-2xx command reply (MAIL FROM) before sending DATA", async () => {
    await withFake({ rejectMail: true, }, async (fake,) => {
      await expect(transportFor(fake.port,).send(MESSAGE,),)
        .rejects.toThrow(/SMTP MAIL.*550/,);

      expect(fake.state.sawTls,).toBe(true,);
      expect(fake.state.dataRaw,).toHaveLength(0,);
    },);
  });

  test("times out a STARTTLS handshake that never completes", async () => {
    await withFake({ stallTls: true, }, async (fake,) => {
      await expect(
        createSmtpTransport({
          host: "127.0.0.1",
          port: fake.port,
          user: "bot@example.com",
          password: "s3cret",
          timeoutMs: 150,
          rejectUnauthorized: false,
        },).send(MESSAGE,),
      ).rejects.toThrow(/handshake timed out/,);
    },);
  });

  test("falls back to AUTH LOGIN when the server advertises LOGIN but not PLAIN", async () => {
    await withFake({ authMechanisms: "LOGIN", }, async (fake,) => {
      const id = await transportFor(fake.port,).send(MESSAGE,);
      expect(id,).toBe("",);
      expect(fake.state.sawStarttls,).toBe(true,);
      expect(fake.state.sawTls,).toBe(true,);
      expect(fake.state.authBeforeTls,).toBe(false,);
      expect(fake.state.authLines,).toEqual([
        "AUTH LOGIN",
        Buffer.from("bot@example.com", "utf8",).toString("base64",),
        Buffer.from("s3cret", "utf8",).toString("base64",),
      ],);

      expect(fake.state.dataRaw,).toHaveLength(1,);
    },);
  });

  test("uses implicit TLS on a non-465 port when implicitTls is set", async () => {
    await withFake({ implicitTls: true, }, async (fake,) => {
      const id = await transportFor(fake.port, true,).send(MESSAGE,);
      expect(id,).toBe("",);
      expect(fake.state.sawStarttls,).toBe(false,);
      expect(fake.state.sawTls,).toBe(true,);
      expect(fake.state.authBeforeTls,).toBe(false,);
      expect(fake.state.authLines,).toHaveLength(1,);
      expect(fake.state.dataRaw,).toHaveLength(1,);
    },);
  });
});

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for leaf-SPKI pin verification.
 *
 * Live-path tests run against a real loopback TLS server using the
 * self-signed fixture in ./spki-pin-fixture/. The reference pin was computed
 * at fixture generation time with:
 *   openssl x509 -in leaf.pem -pubkey -noout \
 *     | openssl pkey -pubin -outform DER \
 *     | openssl dgst -sha256 -binary | base64
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { X509Certificate, } from "node:crypto";
import { readFileSync, } from "node:fs";
import { type AddressInfo, createServer as createTcpServer, } from "node:net";
import * as tls from "node:tls";
import {
  createPeerPinVerifier,
  PIN_VERDICT_TTL_MS,
  pinsMatch,
  probeSpkiPin,
  spkiPinFromDer,
  verifyPeerPin,
} from "./spki-pin";

const LEAF_PEM = readFileSync(new URL("./spki-pin-fixture/leaf.pem", import.meta.url,), "utf-8",);
const LEAF_KEY_PEM = readFileSync(new URL("./spki-pin-fixture/leaf.key.pem", import.meta.url,), "utf-8",);
const LEAF_PIN = "sha256:DwY3o1sPbYOv/qR6HCwpzVnziCVm7ftj82FH51Lrbyc=";

let tlsPort = 0;
let socketsAccepted = 0;
const tlsServer = tls.createServer({ cert: LEAF_PEM, key: LEAF_KEY_PEM, }, () => {},);

beforeAll(async () => {
  await new Promise<void>((resolve,) => tlsServer.listen(0, "127.0.0.1", resolve,));
  tlsPort = (tlsServer.address() as AddressInfo).port;
  tlsServer.on("connection", () => {
    socketsAccepted += 1;
  },);
},);

afterAll(() => {
  tlsServer.close();
},);

/** Port of a just-closed loopback server: reliably connection-refused. */
async function closedPort(): Promise<number> {
  const holder = createTcpServer(() => {},);
  await new Promise<void>((resolve,) => holder.listen(0, "127.0.0.1", resolve,));
  const port = (holder.address() as AddressInfo).port;
  await new Promise<void>((resolve,) => holder.close(() => resolve()));
  return port;
}

describe("spkiPinFromDer", () => {
  test("derives the openssl reference pin from the fixture leaf", () => {
    const der = new X509Certificate(LEAF_PEM,).raw as Buffer;
    expect(spkiPinFromDer(der,),).toBe(LEAF_PIN,);
  });

  test("throws on non-certificate DER", () => {
    expect(() => spkiPinFromDer(Buffer.from([0x01, 0x02, 0x03,],),)).toThrow();
  });
});

describe("pinsMatch", () => {
  test("bare and sha256:-prefixed forms match", () => {
    const bare = LEAF_PIN.slice("sha256:".length,);
    expect(pinsMatch(LEAF_PIN, [bare,],),).toBe(true,);
    expect(pinsMatch(bare, [LEAF_PIN,],),).toBe(true,);
  });

  test("surrounding whitespace is ignored", () => {
    expect(pinsMatch(`  ${LEAF_PIN}  `, [`\n${LEAF_PIN}\n`,],),).toBe(true,);
  });

  test("different digest does not match", () => {
    expect(pinsMatch(LEAF_PIN, ["sha256:rF/8Fp0VQFNQ8uC7Y0PtLPHPOSHKOH2mSIX9bFxxQTc=",],),).toBe(false,);
  });

  test("empty pin set or empty candidate never matches", () => {
    expect(pinsMatch(LEAF_PIN, [],),).toBe(false,);
    expect(pinsMatch("", [LEAF_PIN,],),).toBe(false,);
    expect(pinsMatch("   ", [LEAF_PIN,],),).toBe(false,);
  });
});

describe("probeSpkiPin", () => {
  test("returns the fixture pin from a live loopback TLS server", async () => {
    await expect(probeSpkiPin({ host: "127.0.0.1", port: tlsPort, servername: "localhost", },),).resolves.toBe(
      LEAF_PIN,
    );
  });

  test("rejects against a closed port", async () => {
    const port = await closedPort();
    await expect(probeSpkiPin({ host: "127.0.0.1", port, timeoutMs: 500, },),).rejects.toThrow();
  });

  test("times out against a silent TCP peer", async () => {
    const silent = createTcpServer(() => {},);
    await new Promise<void>((resolve,) => silent.listen(0, "127.0.0.1", resolve,));
    const port = (silent.address() as AddressInfo).port;
    await expect(probeSpkiPin({ host: "127.0.0.1", port, timeoutMs: 250, },),).rejects.toThrow("timed out",);
    silent.close();
  });
});

describe("verifyPeerPin", () => {
  test("matching pin → true", async () => {
    await expect(verifyPeerPin(`https://127.0.0.1:${tlsPort}`, [LEAF_PIN,],),).resolves.toBe(true,);
  });

  test("correct pin among decoys → true", async () => {
    await expect(
      verifyPeerPin(`https://127.0.0.1:${tlsPort}`, [
        "sha256:rF/8Fp0VQFNQ8uC7Y0PtLPHPOSHKOH2mSIX9bFxxQTc=",
        LEAF_PIN,
      ],),
    ).resolves.toBe(true,);
  });

  test("mismatching pin → false", async () => {
    await expect(
      verifyPeerPin(`https://127.0.0.1:${tlsPort}`, ["sha256:rF/8Fp0VQFNQ8uC7Y0PtLPHPOSHKOH2mSIX9bFxxQTc=",],),
    ).resolves.toBe(false,);
  });

  test("unreachable origin → false (never throws)", async () => {
    const port = await closedPort();
    await expect(verifyPeerPin(`https://127.0.0.1:${port}`, [LEAF_PIN,],),).resolves.toBe(false,);
  });

  test.each([
    ["http origin cannot be pinned", `http://127.0.0.1:${tlsPort}`, [LEAF_PIN,],],
    ["non-http scheme", "ftp://127.0.0.1:21", [LEAF_PIN,],],
    ["not a URL", "not-a-peer", [LEAF_PIN,],],
    ["empty pin set", `https://127.0.0.1:${tlsPort}`, [],],
  ],)("%s → false", async (_name, origin, pins,) => {
    await expect(verifyPeerPin(origin, pins,),).resolves.toBe(false,);
  },);
});

describe("createPeerPinVerifier", () => {
  interface ProbeCall {
    host: string;
    port: number;
  }

  function spyProbe(
    pin: string | Error,
  ): {
    probe: (opts: { host: string; port: number; servername?: string; timeoutMs?: number },) => Promise<string>;
    calls: ProbeCall[];
  } {
    const calls: ProbeCall[] = [];
    return {
      calls,
      probe: (opts,) => {
        calls.push({ host: opts.host, port: opts.port, },);
        return pin instanceof Error ? Promise.reject(pin,) : Promise.resolve(pin,);
      },
    };
  }

  test("caches a positive verdict within the TTL, re-probes after expiry", async () => {
    let t = 0;
    const { probe, calls, } = spyProbe(LEAF_PIN,);
    const verify = createPeerPinVerifier({ ttlMs: 1_000, now: (): number => t, probe, },);

    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(true,);
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(true,);
    expect(calls,).toHaveLength(1,);

    t = 999;
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(true,);
    expect(calls,).toHaveLength(1,);

    t = 1_000;
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(true,);
    expect(calls,).toHaveLength(2,);
  });

  test("negative verdicts are not cached", async () => {
    const { probe, calls, } = spyProbe("sha256:rF/8Fp0VQFNQ8uC7Y0PtLPHPOSHKOH2mSIX9bFxxQTc=",);
    const verify = createPeerPinVerifier({ now: (): number => 0, probe, },);
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(false,);
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(false,);
    expect(calls,).toHaveLength(2,);
  });

  test("a changed pin set re-probes", async () => {
    const { probe, calls, } = spyProbe(LEAF_PIN,);
    const verify = createPeerPinVerifier({ now: (): number => 0, probe, },);
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(true,);
    await expect(verify("https://peer.example.com", ["sha256:rF/8Fp0VQFNQ8uC7Y0PtLPHPOSHKOH2mSIX9bFxxQTc=",],),)
      .resolves.toBe(false,);

    expect(calls,).toHaveLength(2,);
  });

  test("probe failures return false, not throw", async () => {
    const { probe, } = spyProbe(new Error("socket gone",),);
    const verify = createPeerPinVerifier({ probe, },);
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(false,);
  });

  test("unverifiable origins return false without probing", async () => {
    const { probe, calls, } = spyProbe(LEAF_PIN,);
    const verify = createPeerPinVerifier({ probe, },);
    await expect(verify("http://peer.example.com", [LEAF_PIN,],),).resolves.toBe(false,);
    await expect(verify("https://peer.example.com", ["   ",],),).resolves.toBe(false,);
    await expect(verify("::garbage::", [LEAF_PIN,],),).resolves.toBe(false,);
    await expect(verify("https://peer.example.com:0", [LEAF_PIN,],),).resolves.toBe(false,);
    expect(calls,).toHaveLength(0,);
  });

  test("parses default port and ipv6 literals for the probe", async () => {
    const { probe, calls, } = spyProbe(LEAF_PIN,);
    const verify = createPeerPinVerifier({ probe, },);
    await expect(verify("https://peer.example.com", [LEAF_PIN,],),).resolves.toBe(true,);
    await expect(verify("https://[::1]:8443", [LEAF_PIN,],),).resolves.toBe(true,);
    expect(calls,).toEqual([
      { host: "peer.example.com", port: 443, },
      { host: "::1", port: 8443, },
    ],);
  });

  test("default verifier caches against the live server (one socket per TTL)", async () => {
    const verify = createPeerPinVerifier();
    const before = socketsAccepted;
    await expect(verify(`https://127.0.0.1:${tlsPort}`, [LEAF_PIN,],),).resolves.toBe(true,);
    await expect(verify(`https://127.0.0.1:${tlsPort}`, [LEAF_PIN,],),).resolves.toBe(true,);
    expect(socketsAccepted,).toBe(before + 1,);
  });

  test("default TTL mirrors the gossip heartbeat TTL", () => {
    expect(PIN_VERDICT_TTL_MS,).toBe(30_000,);
  });
});

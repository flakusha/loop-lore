// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The closed workload-class enum and the declared vs advertised split.
 * Declared comes from config (what we will run for others); advertised comes
 * off the wire (what a peer says it accepts). Neither implies the other.
 */
import { describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import {
  PEER_AUTH_MODES,
  PEER_INSTANCE_KINDS,
  PEER_WORKLOAD_CLASSES,
  PeerWorkloadClass,
} from "../db/enums-federation";
import { declaredWorkloadClasses, isPeerWorkloadClass, parseAdvertisedClasses, } from "./peer-capabilities";

function configWithClasses(classes: string[],): Config {
  return {
    federation: { enabled: true, peers: [], workloadOffload: { classes, }, },
  } as unknown as Config;
}

describe("workload class enum", () => {
  test("the class list is exactly the seven agreed classes", () => {
    expect(PEER_WORKLOAD_CLASSES,).toEqual([
      PeerWorkloadClass.Chat,
      PeerWorkloadClass.Image,
      PeerWorkloadClass.Aux,
      PeerWorkloadClass.Tts,
      PeerWorkloadClass.Translation,
      PeerWorkloadClass.Embedding,
      PeerWorkloadClass.Vision,
    ],);

    expect(PEER_WORKLOAD_CLASSES.length,).toBe(7,);
  });

  test("the auth mode list is tls plus host-local", () => {
    expect(PEER_AUTH_MODES,).toEqual(["tls", "host-local",],);
  });

  test("the instance-kind list carries the kinds a peer can advertise", () => {
    expect(PEER_INSTANCE_KINDS,).toEqual(["business", "rpg", "assistant", "dedicated-gpu", "general",],);
  });
});

describe("isPeerWorkloadClass", () => {
  test("accepts every member and rejects anything else", () => {
    for (const value of PEER_WORKLOAD_CLASSES) {
      expect(isPeerWorkloadClass(value,),).toBe(true,);
    }
  });

  test("rejects near-misses: wrong case, extra names, empty and unknown", () => {
    for (const value of ["Chat", "CHAT", "images", "", " audio", "3d", "video",]) {
      expect(isPeerWorkloadClass(value,),).toBe(false,);
    }
  });
});

describe("declaredWorkloadClasses", () => {
  test("returns the configured classes in config order", () => {
    const config = configWithClasses(["vision", "chat",],);
    expect(declaredWorkloadClasses(config,),).toEqual([PeerWorkloadClass.Vision, PeerWorkloadClass.Chat,],);
  });

  test("drops a configured class that is not in the enum", () => {
    expect(declaredWorkloadClasses(configWithClasses(["chat", "hologram",],),),).toEqual([
      PeerWorkloadClass.Chat,
    ],);
  });

  test("an instance with no workloadOffload block declares nothing", () => {
    expect(declaredWorkloadClasses({ federation: { enabled: true, peers: [], }, } as unknown as Config,),).toEqual([],);
  });

  test("a non-array workloadOffload.classes declares nothing rather than throwing", () => {
    const config = {
      federation: { enabled: true, peers: [], workloadOffload: { classes: "chat", }, },
    } as unknown as Config;

    expect(declaredWorkloadClasses(config,),).toEqual([],);
  });
});

describe("parseAdvertisedClasses", () => {
  test("reads a wire array of known classes", () => {
    expect(parseAdvertisedClasses(["chat", "tts",],),).toEqual([PeerWorkloadClass.Chat, PeerWorkloadClass.Tts,],);
  });

  test("keeps only known classes from a mixed advertisement", () => {
    expect(parseAdvertisedClasses(["chat", "hologram", 42, null, "vision",],),).toEqual([
      PeerWorkloadClass.Chat,
      PeerWorkloadClass.Vision,
    ],);
  });

  test("de-duplicates repeats in one advertisement", () => {
    expect(parseAdvertisedClasses(["chat", "chat", "image",],),).toEqual([
      PeerWorkloadClass.Chat,
      PeerWorkloadClass.Image,
    ],);
  });

  test("a missing or malformed field yields an empty set, never a throw", () => {
    expect(parseAdvertisedClasses(undefined,),).toEqual([],);
    expect(parseAdvertisedClasses(null,),).toEqual([],);
    expect(parseAdvertisedClasses("chat",),).toEqual([],);
    expect(parseAdvertisedClasses({ chat: true, },),).toEqual([],);
    expect(parseAdvertisedClasses([],),).toEqual([],);
  });
});

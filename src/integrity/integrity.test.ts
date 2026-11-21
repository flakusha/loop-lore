// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import type { Logger, } from "../logger/types";
import {
  clearRunning,
  detectUncleanShutdown,
  type IntegrityChecker,
  type IntegrityResult,
  markRunning,
  quarantineVerdict,
  runStartupIntegrityGate,
  type SentinelFs,
} from "./crash-recovery";
import { isWriteBlocked, } from "./safe-mode";
import { createSqliteIntegrityChecker, } from "./sqlite-check";
import {
  clearSafeMode,
  enterSafeMode,
  getIntegrityState,
  resetIntegrityState,
} from "./state";

function memoryFs(): SentinelFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    exists(path,) {
      return files.has(path,);
    },
    write(path, data,) {
      files.set(path, data,);
    },
    remove(path,) {
      files.delete(path,);
    },
    read(path,) {
      return files.get(path,) ?? "";
    },
  };
}

const stubLogger = {
  info() {},
  error() {},
  warn() {},
  debug() {},
} as unknown as Logger;

const PASS: IntegrityResult = { verdict: "pass", detail: "ok", };
const FAIL: IntegrityResult = { verdict: "fail", detail: "page 3 corrupt", };

const paths = { sentinel: "/state/sentinel", quarantine: "/state/quarantine", };

function checker(result: IntegrityResult,): IntegrityChecker {
  return () => result;
}

beforeEach(() => {
  resetIntegrityState();
},);

describe("sentinel lifecycle", () => {
  test("no sentinel means clean shutdown", () => {
    const fs = memoryFs();
    expect(detectUncleanShutdown(fs, paths.sentinel,),).toBe(false,);
  });

  test("markRunning writes a sentinel; clearRunning removes it", () => {
    const fs = memoryFs();
    markRunning(fs, paths.sentinel, new Date("2026-01-01T00:00:00Z",),);
    expect(fs.exists(paths.sentinel,),).toBe(true,);
    expect(JSON.parse(fs.read(paths.sentinel,),).pid,).toBe(process.pid,);
    clearRunning(fs, paths.sentinel,);
    expect(fs.exists(paths.sentinel,),).toBe(false,);
  });

  test("a left-over sentinel detects an unclean shutdown", () => {
    const fs = memoryFs();
    markRunning(fs, paths.sentinel,);
    expect(detectUncleanShutdown(fs, paths.sentinel,),).toBe(true,);
  });
});

describe("startup integrity gate", () => {
  test("clean boot skips the check and reports unknown", () => {
    const fs = memoryFs();
    const result = runStartupIntegrityGate({
      fs,
      paths,
      checker: checker(FAIL,),
      logger: stubLogger,
    },);

    expect(result,).toBeNull();
    expect(getIntegrityState().verdict,).toBe("unknown",);
    expect(getIntegrityState().safeMode,).toBe(false,);
    expect(fs.exists(paths.sentinel,),).toBe(true,);
  });

  test("unclean boot with passing check resumes normally", () => {
    const fs = memoryFs();
    markRunning(fs, paths.sentinel,);
    const result = runStartupIntegrityGate({
      fs,
      paths,
      checker: checker(PASS,),
      logger: stubLogger,
    },);

    expect(result?.verdict,).toBe("pass",);
    expect(getIntegrityState().uncleanShutdown,).toBe(true,);
    expect(getIntegrityState().safeMode,).toBe(false,);
  });

  test("unclean boot with failing check enters safe mode + quarantine", () => {
    const fs = memoryFs();
    markRunning(fs, paths.sentinel,);
    const result = runStartupIntegrityGate({
      fs,
      paths,
      checker: checker(FAIL,),
      logger: stubLogger,
    },);

    expect(result?.verdict,).toBe("fail",);
    expect(getIntegrityState().safeMode,).toBe(true,);
    expect(getIntegrityState().safeModeReason,).toContain("unclean shutdown",);
    expect(fs.exists(paths.quarantine,),).toBe(true,);
    expect(fs.read(paths.quarantine,),).toContain("page 3 corrupt",);
  });

  test("a throwing checker fails closed into safe mode", () => {
    const fs = memoryFs();
    markRunning(fs, paths.sentinel,);
    const throwing: IntegrityChecker = () => {
      throw new Error("boom",);
    };

    const result = runStartupIntegrityGate({
      fs,
      paths,
      checker: throwing,
      logger: stubLogger,
    },);

    expect(result?.verdict,).toBe("fail",);
    expect(getIntegrityState().safeMode,).toBe(true,);
  });
});

describe("quarantine", () => {
  test("writes a verdict record and never deletes live data", () => {
    const fs = memoryFs();
    fs.write("/state/live.db", "DATA",);
    const record = quarantineVerdict(fs, "/state/q", FAIL,);
    expect(record,).toContain("page 3 corrupt",);
    expect(fs.read("/state/live.db",),).toBe("DATA",);
  });
});

describe("safe-mode write gate", () => {
  test("reads are never blocked", () => {
    enterSafeMode("test",);
    for (const method of ["GET", "HEAD", "OPTIONS",]) {
      expect(isWriteBlocked(method,),).toBe(false,);
    }
  });

  test("writes are blocked only in safe mode", () => {
    expect(isWriteBlocked("POST",),).toBe(false,);
    enterSafeMode("test",);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post",]) {
      expect(isWriteBlocked(method,),).toBe(true,);
    }

    clearSafeMode();
    expect(isWriteBlocked("POST",),).toBe(false,);
  });
});

describe("sqlite quick_check binding", () => {
  test("maps ok + problem rows to verdicts", () => {
    const rows = (values: string,) => ({
      query: () => ({
        all: () => values.split(",",).map((value,) => ({ quick_check: value, })),
      }),
    });

    const ok = createSqliteIntegrityChecker(rows("ok",) as never,);
    expect(ok().verdict,).toBe("pass",);
    const bad = createSqliteIntegrityChecker(rows("ok,page 3 corrupt",) as never,);
    expect(bad().verdict,).toBe("fail",);
    expect(bad().detail,).toBe("page 3 corrupt",);
  });
});

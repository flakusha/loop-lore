// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Real-behavior contract tests for the provisioned-resource admin response
 * schemas (inference / storage / backups). Valid payloads use only declared
 * fields: the routes mount these same schema objects with Elysia, which flips
 * `additionalProperties` to false, so extra-field assertions would depend on
 * mount order. This file never mounts anything and stays mutation-agnostic.
 */
import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  AdminBackupRecord,
  AdminBackupVerifyResponse,
  AdminBackupWriteResponse,
  AdminInferenceAddResponse,
  AdminInferenceListResponse,
  AdminInferenceProbeResponse,
  AdminInferenceResource,
  AdminResourceQuota,
  AdminStorageAddResponse,
  AdminStorageListResponse,
  AdminStorageProbeResponse,
  AdminStorageResource,
} from "./responses-admin";

const ID = "res_01";
const OWNER = "owner_01";

const quota = { requestsPerMinute: 60, tokensPerMinute: 1000, };
const inference = {
  id: ID,
  ownerId: OWNER,
  kind: "llm",
  provider: "ollama",
  endpoint: "http://localhost:11434",
  quota,
  status: "active",
};

const storage = {
  id: ID,
  ownerId: OWNER,
  kind: "s3",
  endpoint: "https://s3.example.test",
  storageQuotaBytes: 1024,
  status: "active",
};

const backup = {
  id: "bak_01",
  resourceType: "inference",
  ownerId: OWNER,
  contentHash: "sha256-content",
  serverHash: null,
  payload: "e30=",
  version: 1,
  storageQuotaBytes: 1024,
};

describe("AdminResourceQuota", () => {
  test("accepts a quota with both ceilings", () => {
    expect(Value.Check(AdminResourceQuota, quota,),).toBe(true,);
  });

  test("accepts a quota with tokensPerMinute omitted (optional ceiling)", () => {
    expect(Value.Check(AdminResourceQuota, { requestsPerMinute: 60, },),).toBe(true,);
  });

  test("rejects a string tokensPerMinute", () => {
    expect(
      Value.Check(AdminResourceQuota, { requestsPerMinute: 60, tokensPerMinute: "1000", },),
    ).toBe(false,);
  });

  test("rejects a missing requestsPerMinute", () => {
    expect(Value.Check(AdminResourceQuota, { tokensPerMinute: 1000, },),).toBe(false,);
  });
});

describe("AdminInferenceResource", () => {
  test("accepts a full inference resource", () => {
    expect(Value.Check(AdminInferenceResource, inference,),).toBe(true,);
  });

  test("accepts each declared kind literal", () => {
    for (const kind of ["llm", "sd", "comfyui",]) {
      expect(Value.Check(AdminInferenceResource, { ...inference, kind, },),).toBe(true,);
    }
  });

  test("rejects an undeclared kind", () => {
    expect(Value.Check(AdminInferenceResource, { ...inference, kind: "unknown", },),).toBe(false,);
  });

  test("rejects a missing quota", () => {
    const { quota: _omitted, ...withoutQuota } = inference;
    expect(Value.Check(AdminInferenceResource, withoutQuota,),).toBe(false,);
  });

  test("rejects a non-string id", () => {
    expect(Value.Check(AdminInferenceResource, { ...inference, id: 7, },),).toBe(false,);
  });
});

describe("AdminStorageResource", () => {
  test("accepts a full storage resource", () => {
    expect(Value.Check(AdminStorageResource, storage,),).toBe(true,);
  });

  test("accepts each declared kind literal", () => {
    for (const kind of ["s3", "webdav",]) {
      expect(Value.Check(AdminStorageResource, { ...storage, kind, },),).toBe(true,);
    }
  });

  test("rejects an inference kind on a storage resource", () => {
    expect(Value.Check(AdminStorageResource, { ...storage, kind: "llm", },),).toBe(false,);
  });

  test("rejects a string storageQuotaBytes", () => {
    expect(Value.Check(AdminStorageResource, { ...storage, storageQuotaBytes: "1024", },),).toBe(
      false,
    );
  });
});

describe("AdminBackupRecord", () => {
  test("accepts a backup with a null server hash", () => {
    expect(Value.Check(AdminBackupRecord, backup,),).toBe(true,);
  });

  test("accepts a string server hash", () => {
    expect(Value.Check(AdminBackupRecord, { ...backup, serverHash: "sha256-server", },),).toBe(true,);
  });

  test("rejects a string version", () => {
    expect(Value.Check(AdminBackupRecord, { ...backup, version: "1", },),).toBe(false,);
  });

  test("rejects a missing payload", () => {
    const { payload: _omitted, ...withoutPayload } = backup;
    expect(Value.Check(AdminBackupRecord, withoutPayload,),).toBe(false,);
  });
});

describe("AdminInferenceProbeResponse", () => {
  test("accepts the ok=true branch with the public resource view", () => {
    expect(Value.Check(AdminInferenceProbeResponse, { ok: true, resource: inference, },),).toBe(true,);
  });

  test("accepts the ok=false branch with a reason and fallback", () => {
    expect(
      Value.Check(AdminInferenceProbeResponse, {
        ok: false,
        reason: "paused",
        fallback: "built-in endpoint",
      },),
    ).toBe(true,);
  });

  test("rejects ok=true with a reason but no resource", () => {
    expect(
      Value.Check(AdminInferenceProbeResponse, { ok: true, reason: "paused", fallback: "x", },),
    ).toBe(false,);
  });

  test("rejects an undeclared reason", () => {
    expect(
      Value.Check(AdminInferenceProbeResponse, {
        ok: false,
        reason: "unknown-reason",
        fallback: "x",
      },),
    ).toBe(false,);
  });

  test("rejects ok=false without a fallback note", () => {
    expect(Value.Check(AdminInferenceProbeResponse, { ok: false, reason: "revoked", },),).toBe(false,);
  });
});

describe("AdminStorageProbeResponse", () => {
  test("accepts the ok=true branch with the storage resource view", () => {
    expect(Value.Check(AdminStorageProbeResponse, { ok: true, resource: storage, },),).toBe(true,);
  });

  test("accepts the ok=false branch (shared reason vocabulary)", () => {
    expect(
      Value.Check(AdminStorageProbeResponse, {
        ok: false,
        reason: "exhausted",
        fallback: "built-in bucket",
      },),
    ).toBe(true,);
  });

  test("rejects ok=true carrying a storage resource with an inference kind", () => {
    expect(
      Value.Check(AdminStorageProbeResponse, { ok: true, resource: { ...storage, kind: "sd", }, },),
    ).toBe(false,);
  });

  test("rejects an undeclared reason", () => {
    expect(
      Value.Check(AdminStorageProbeResponse, { ok: false, reason: "bogus", fallback: "x", },),
    ).toBe(false,);
  });
});

describe("admin resource envelopes", () => {
  test("AdminInferenceListResponse accepts a resource array", () => {
    expect(Value.Check(AdminInferenceListResponse, { resources: [inference,], },),).toBe(true,);
  });

  test("AdminInferenceListResponse rejects a non-array resources field", () => {
    expect(Value.Check(AdminInferenceListResponse, { resources: inference, },),).toBe(false,);
  });

  test("AdminInferenceAddResponse accepts a wrapped resource", () => {
    expect(Value.Check(AdminInferenceAddResponse, { resource: inference, },),).toBe(true,);
  });

  test("AdminInferenceAddResponse rejects a missing resource", () => {
    expect(Value.Check(AdminInferenceAddResponse, {},),).toBe(false,);
  });

  test("AdminStorageListResponse rejects a malformed resource in the array", () => {
    expect(
      Value.Check(AdminStorageListResponse, { resources: [{ ...storage, kind: "llm", },], },),
    ).toBe(false,);
  });

  test("AdminStorageAddResponse accepts a wrapped resource", () => {
    expect(Value.Check(AdminStorageAddResponse, { resource: storage, },),).toBe(true,);
  });

  test("AdminStorageAddResponse rejects a missing resource", () => {
    expect(Value.Check(AdminStorageAddResponse, {},),).toBe(false,);
  });

  test("AdminBackupWriteResponse accepts a wrapped backup", () => {
    expect(Value.Check(AdminBackupWriteResponse, { backup, },),).toBe(true,);
  });

  test("AdminBackupWriteResponse rejects a backup with a bad version", () => {
    expect(Value.Check(AdminBackupWriteResponse, { backup: { ...backup, version: "1", }, },),).toBe(
      false,
    );
  });

  test("AdminBackupVerifyResponse accepts ok=true with a backup", () => {
    expect(Value.Check(AdminBackupVerifyResponse, { ok: true, backup, },),).toBe(true,);
  });

  test("AdminBackupVerifyResponse rejects ok=false", () => {
    expect(Value.Check(AdminBackupVerifyResponse, { ok: false, backup, },),).toBe(false,);
  });

  test("AdminBackupVerifyResponse rejects a missing backup", () => {
    expect(Value.Check(AdminBackupVerifyResponse, { ok: true, },),).toBe(false,);
  });
});

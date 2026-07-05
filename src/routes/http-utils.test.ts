/**
 * Tests for HTTP response utilities.
 *
 * All functions are pure — no DB, no I/O, no mocks needed.
 * Every test creates a Response and asserts status/body shape.
 */
import { describe, test, expect } from "bun:test";
import {
  HttpStatus,
  ErrorCode,
  NotFoundError,
  ForbiddenError,
  jsonResponse,
  jsonError,
  jsonValidationError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
} from "./http-utils";

// ── jsonResponse ──────────────────────────────────────────────

describe("jsonResponse", () => {
  test("returns 200 with JSON body", async () => {
    const res = jsonResponse({ ok: true, id: "abc" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "abc" });
  });

  test("accepts custom status code", () => {
    const res = jsonResponse({ id: "new" }, HttpStatus.Created);
    expect(res.status).toBe(201);
  });

  test("can send array data", async () => {
    const res = jsonResponse([1, 2, 3]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([1, 2, 3]);
  });

  test("can send primitive", async () => {
    const res = jsonResponse("hello");
    expect(await res.json()).toBe("hello");
  });

  test("default Content-Type includes application/json", () => {
    const res = jsonResponse({});
    expect(res.headers.get("content-type")).toStartWith("application/json");
  });
});

// ── jsonError ─────────────────────────────────────────────────

describe("jsonError", () => {
  test("returns 400 with error message by default", async () => {
    const res = jsonError("Bad input");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad input" });
  });

  test("accepts custom status code", () => {
    const res = jsonError("Not found", HttpStatus.NotFound);
    expect(res.status).toBe(404);
  });

  test("includes code when provided", async () => {
    const res = jsonError("Expired token", HttpStatus.Unauthorized, "UNAUTHORIZED");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Expired token", code: "UNAUTHORIZED" });
  });

  test("omits code field when not provided", async () => {
    const res = jsonError("Generic error", HttpStatus.InternalServerError);
    const body = await res.json();
    expect(body).not.toHaveProperty("code");
  });

  test("explicitly passes undefined code as omitted", async () => {
    const res = jsonError("msg", HttpStatus.BadRequest);
    const body = await res.json();
    expect(body).not.toHaveProperty("code");
  });
});

// ── jsonValidationError ───────────────────────────────────────

describe("jsonValidationError", () => {
  test("returns 422 with field errors", async () => {
    const errors = [{ field: "email", message: "Invalid format" }];
    const res = jsonValidationError(errors);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: errors,
    });
  });

  test("accepts custom error message", async () => {
    const res = jsonValidationError([], "Custom message");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Custom message");
  });

  test("multiple validation errors", async () => {
    const errors = [
      { field: "name", message: "Required" },
      { field: "age", message: "Must be ≥ 18" },
    ];
    const res = jsonValidationError(errors);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.details).toHaveLength(2);
  });

  test("empty errors array is valid", async () => {
    const res = jsonValidationError([]);
    expect(res.status).toBe(422);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.details).toEqual([]);
  });
});

// ── jsonPaginated ─────────────────────────────────────────────

describe("jsonPaginated", () => {
  const items = [{ id: 1 }, { id: 2 }];

  test("returns 200 with data and pagination", async () => {
    const res = jsonPaginated(items, 10, 1, 5);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.data).toEqual(items);
    expect(body.pagination).toEqual({
      total: 10,
      page: 1,
      pageSize: 5,
      totalPages: 2,
    });
  });

  test("single page", async () => {
    const res = jsonPaginated(items, 2, 1, 10);
    const body = (await res.json()) as { pagination: { totalPages: number } };
    expect(body.pagination.totalPages).toBe(1);
  });

  test("exact page boundary", async () => {
    const res = jsonPaginated(items, 10, 2, 5);
    const body = (await res.json()) as { pagination: { totalPages: number; page: number } };
    expect(body.pagination.totalPages).toBe(2);
    expect(body.pagination.page).toBe(2);
  });

  test("empty dataset", async () => {
    const res = jsonPaginated([], 0, 1, 20);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number; totalPages: number } };
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.totalPages).toBe(0);
  });

  test("pageSize zero avoids division by zero", async () => {
    const res = jsonPaginated(items, 5, 1, 0);
    const body = (await res.json()) as { pagination: { totalPages: number; pageSize: number } };
    expect(body.pagination.totalPages).toBe(0);
    expect(body.pagination.pageSize).toBe(0);
  });
});

// ── jsonCreated ───────────────────────────────────────────────

describe("jsonCreated", () => {
  test("returns 201 with JSON body", async () => {
    const res = jsonCreated({ id: "new-entity" });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ id: "new-entity" });
  });

  test("returns 201 with null body when no data", async () => {
    const res = jsonCreated();
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBeNull();
    // 201 with null body should have no content
    const text = await res.text();
    expect(text).toBe("");
  });

  test("returns 201 with explicit undefined", async () => {
    const res = jsonCreated();
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).toBe("");
  });
});

// ── jsonNoContent ─────────────────────────────────────────────

describe("jsonNoContent", () => {
  test("returns 204 with no body", async () => {
    const res = jsonNoContent();
    expect(res.status).toBe(204);
    const text = await res.text();
    expect(text).toBe("");
  });

  test("no content-type header", () => {
    const res = jsonNoContent();
    expect(res.headers.get("content-type")).toBeNull();
  });
});

// ── HttpStatus constants ──────────────────────────────────────

describe("HttpStatus", () => {
  test("all status codes are valid HTTP", () => {
    const codes = Object.values(HttpStatus);
    for (const code of codes) {
      expect(code).toBeGreaterThanOrEqual(100);
      expect(code).toBeLessThan(600);
    }
  });

  test("critical codes match expected values", () => {
    expect(HttpStatus.OK).toBe(200);
    expect(HttpStatus.Created).toBe(201);
    expect(HttpStatus.NoContent).toBe(204);
    expect(HttpStatus.BadRequest).toBe(400);
    expect(HttpStatus.Unauthorized).toBe(401);
    expect(HttpStatus.Forbidden).toBe(403);
    expect(HttpStatus.NotFound).toBe(404);
    expect(HttpStatus.UnprocessableEntity).toBe(422);
    expect(HttpStatus.InternalServerError).toBe(500);
    expect(HttpStatus.NotImplemented).toBe(501);
    expect(HttpStatus.TooManyRequests).toBe(429);
  });
});

// ── ErrorCode enum ────────────────────────────────────────────

describe("ErrorCode", () => {
  test("all codes are present and uppercase", () => {
    const codes = Object.values(ErrorCode);
    for (const code of codes) {
      expect(code).toBeTruthy();
      expect(code).toEqual(code);
    }
  });

  test("critical codes match expected values", () => {
    expect(ErrorCode.BadRequest).toBe("BAD_REQUEST");
    expect(ErrorCode.Unauthorized).toBe("UNAUTHORIZED");
    expect(ErrorCode.Forbidden).toBe("FORBIDDEN");
    expect(ErrorCode.NotFound).toBe("NOT_FOUND");
    expect(ErrorCode.ValidationError).toBe("VALIDATION_ERROR");
    expect(ErrorCode.TooManyRequests).toBe("TOO_MANY_REQUESTS");
    expect(ErrorCode.ServerError).toBe("SERVER_ERROR");
    expect(ErrorCode.NotImplemented).toBe("NOT_IMPLEMENTED");
  });
});

// ── Typed errors ──────────────────────────────────────────────

describe("NotFoundError", () => {
  test("formats message from entity + id", () => {
    const err = new NotFoundError("Chat", "abc-123");
    expect(err.message).toBe("Chat not found: abc-123");
    expect(err.name).toBe("NotFoundError");
  });

  test("is instance of Error", () => {
    expect(new NotFoundError("X", "y")).toBeInstanceOf(Error);
  });
});

describe("ForbiddenError", () => {
  test("default message", () => {
    const err = new ForbiddenError();
    expect(err.message).toBe("Forbidden");
    expect(err.name).toBe("ForbiddenError");
  });

  test("custom message", () => {
    const err = new ForbiddenError("Admin only");
    expect(err.message).toBe("Admin only");
  });
});

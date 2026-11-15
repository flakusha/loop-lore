// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/server/port-conflict.ts — Pure EADDRINUSE classifier for boot errors.
// Kept free of Bun/Node listen calls so the friendly port-conflict message
// is unit-testable without binding a port.

type ListenErrorShape = {
  code?: unknown;
  port?: unknown;
  address?: unknown;
  hostname?: unknown;
  host?: unknown;
  message?: unknown;
};

function asShape(error: unknown,): ListenErrorShape | null {
  if (typeof error !== "object" || error === null) { return null; }
  return error as ListenErrorShape;
}

function addressPort(address: unknown,): string | null {
  if (typeof address !== "object" || address === null) { return null; }
  const port = (address as { port?: unknown }).port;
  if (typeof port === "number" && Number.isInteger(port,)) { return String(port,); }
  if (typeof port === "string" && port !== "") { return port; }
  return null;
}

function errorHost(shape: ListenErrorShape,): string | null {
  for (const key of ["hostname", "host", "address",] as const) {
    const value = shape[key];
    if (typeof value === "string" && value !== "") { return value; }
  }

  return null;
}

function errorPort(shape: ListenErrorShape,): string | null {
  if (typeof shape.port === "number" && Number.isInteger(shape.port,)) {
    return String(shape.port,);
  }

  if (typeof shape.port === "string" && shape.port !== "") { return shape.port; }
  const fromAddress = addressPort(shape.address,);
  if (fromAddress !== null) { return fromAddress; }
  if (typeof shape.message === "string") {
    const match = /:(\d{1,5})\b/.exec(shape.message,);
    if (match?.[1]) { return match[1]; }
  }

  return null;
}

/**
 * Returns a friendly port-conflict message when `error` is an EADDRINUSE
 * listen failure, or `null` for every other error (which keeps the generic
 * startup-failure path byte-identical).
 */
export function portConflictMessage(error: unknown,): string | null {
  const shape = asShape(error,);
  if (shape === null || shape.code !== "EADDRINUSE") { return null; }
  const port = errorPort(shape,);
  const host = errorHost(shape,);
  const where = port === null ? "the configured port" : `port ${port}${host === null ? "" : ` on ${host}`}`;

  const hint = port === null
    ? "via the PORT env var (server.port)"
    : `via the PORT env var (server.port), e.g. PORT=${port}`;

  return (
    `[server] ${where} is already in use — another instance or process holds it. ` +
    `Stop it, or use a different port ${hint}.`
  );
}

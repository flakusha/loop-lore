/**
 * Mock Image Provider for E2E tests.
 *
 * Returns a minimal 1x1 PNG when no real sd-server is configured.
 */

export class MockImageProvider {
  async generate(_prompt: string): Promise<{ image: string; mime: string }> {
    // Minimal 1x1 red PNG as base64
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    return { image: base64, mime: "image/png" };
  }

  async healthCheck() {
    return { status: "ok" as const };
  }
}

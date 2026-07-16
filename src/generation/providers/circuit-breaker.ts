/**
 * Circuit Breaker — Per-provider failure tracking with half-open probes
 *
 * States: closed → open (on N consecutive failures) → half-open (after cooldown)
 *         → closed (on success) or open (on failure)
 *
 * Configurable thresholds per provider. Respects Retry-After headers.
 */

type CircuitState = "closed" | "open" | "half-open";

interface CircuitStateInternal {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime: number;
  cooldownUntil: number;
  /** Override cooldown from Retry-After header (ms) */
  retryAfterMs: number;
}

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening circuit (default: 3) */
  threshold?: number;
  /** Base cooldown in ms (default: 10_000, doubled per open) */
  baseCooldownMs?: number;
  /** Max cooldown in ms (default: 300_000 = 5min) */
  maxCooldownMs?: number;
  /** Whether circuit breaker is enabled (default: true) */
  enabled?: boolean;
}

const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
  threshold: 3,
  baseCooldownMs: 10_000,
  maxCooldownMs: 300_000,
  enabled: true,
};

export class CircuitBreaker {
  private circuits = new Map<string, CircuitStateInternal>();
  private configs = new Map<string, Required<CircuitBreakerConfig>>();

  /**
   * Register a provider with optional config overrides.
   * Safe to call multiple times — only sets config on first call.
   */
  register(providerName: string, config?: CircuitBreakerConfig): void {
    if (this.configs.has(providerName)) return;
    this.configs.set(providerName, { ...DEFAULT_CONFIG, ...config });
    this.circuits.set(providerName, {
      state: "closed",
      consecutiveFailures: 0,
      lastFailureTime: 0,
      cooldownUntil: 0,
      retryAfterMs: 0,
    });
  }

  /**
   * Check if a provider is allowed to receive requests.
   * Returns true if closed or half-open, false if open.
   * Half-open probes are allowed — one request passes through to test recovery.
   */
  allowRequest(providerName: string): boolean {
    const cfg = this.configs.get(providerName);
    if (!cfg?.enabled) return true;

    const circuit = this.circuits.get(providerName);
    if (!circuit) return true;

    if (circuit.state === "closed") return true;

    if (circuit.state === "open") {
      // Check if cooldown has expired → transition to half-open
      if (Date.now() >= circuit.cooldownUntil) {
        circuit.state = "half-open";
        return true;
      }
      return false;
    }

    // half-open: allow the probe request
    return true;
  }

  /**
   * Record a successful request. Resets failure count.
   * If half-open, transitions to closed.
   */
  onSuccess(providerName: string): void {
    const circuit = this.circuits.get(providerName);
    if (!circuit) return;

    circuit.consecutiveFailures = 0;
    circuit.retryAfterMs = 0;
    if (circuit.state === "half-open") {
      circuit.state = "closed";
    }
  }

  /**
   * Record a failed request. Increments failure count.
   * If threshold exceeded, opens circuit with exponential backoff cooldown.
   * Respects retryAfter if provided (from Retry-After header).
   */
  onFailure(providerName: string, retryAfterMs?: number): void {
    const cfg = this.configs.get(providerName);
    if (!cfg?.enabled) return;

    const circuit = this.circuits.get(providerName);
    if (!circuit) return;

    circuit.consecutiveFailures++;
    circuit.lastFailureTime = Date.now();

    if (retryAfterMs && retryAfterMs > 0) {
      circuit.retryAfterMs = retryAfterMs;
    }

    if (circuit.consecutiveFailures >= cfg.threshold) {
      circuit.state = "open";
      // Exponential backoff: base * 2^(consecutiveFailures - threshold)
      const backoff = cfg.baseCooldownMs * Math.pow(2, circuit.consecutiveFailures - cfg.threshold);
      const cooldown = Math.max(backoff, circuit.retryAfterMs);
      circuit.cooldownUntil = Date.now() + Math.min(cooldown, cfg.maxCooldownMs);
    }
  }

  /**
   * Reset a provider's circuit to closed state.
   */
  reset(providerName: string): void {
    const circuit = this.circuits.get(providerName);
    if (!circuit) return;

    circuit.state = "closed";
    circuit.consecutiveFailures = 0;
    circuit.cooldownUntil = 0;
    circuit.retryAfterMs = 0;
  }

  /**
   * Get current state for a provider (read-only).
   */
  getState(
    providerName: string,
  ): { state: CircuitState; consecutiveFailures: number; cooldownRemainingMs: number } | undefined {
    const circuit = this.circuits.get(providerName);
    if (!circuit) return undefined;

    return {
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      cooldownRemainingMs: Math.max(0, circuit.cooldownUntil - Date.now()),
    };
  }

  /**
   * Get state for all providers.
   */
  getAllStates(): {
    name: string;
    state: CircuitState;
    consecutiveFailures: number;
    cooldownRemainingMs: number;
  }[] {
    return [...this.circuits].map(([name, circuit]) => ({
      name,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      cooldownRemainingMs: Math.max(0, circuit.cooldownUntil - Date.now()),
    }));
  }
}

/** Singleton circuit breaker instance */
export const circuitBreaker = new CircuitBreaker();

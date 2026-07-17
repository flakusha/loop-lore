# E2E Performance Benchmarks

Deterministic performance tracking tied to git history. Runs against real API stack with fixed seed data. Output: `data/benchmarks/` (gitignored).

## Goals

- Catch perf regressions before shipping
- Same git sha = same result (fixed seed, in-memory DB, mock providers, fixed iterations, single-threaded)
- No external dashboard — diff script is enough

## Output Format

```
data/benchmarks/<git-short-sha>.json
```

## Determinism Requirements

- Fixed UUIDs (same pattern as e2e seed)
- In-memory SQLite (`:memory:`)
- No network calls — mock LLM providers with fixed latency
- Fixed iteration count, warmup discarded, measurement fixed-size
- Single-threaded

## Commands

## Benchmark Categories

### API

| Benchmark             | What It Measures                          |
| --------------------- | ----------------------------------------- |
| Chat CRUD             | Create, list, get, update, delete latency |
| Message send          | Single message POST → stored latency      |
| Message list          | List 100/1000 messages (pagination)       |
| Character list        | Grid query with tags/filters              |
| Asset upload (1 MB)   | Upload + store + metadata extraction      |
| Asset download (1 MB) | Read from disk + stream latency           |
| Generation start      | POST → first SSE token time               |
| Multi-user auth       | Login + session lookup latency            |

### DB

| Benchmark             | What It Measures                         |
| --------------------- | ---------------------------------------- |
| Message insert batch  | 100-message bulk insert                  |
| Chat + messages join  | Chat list with last-message subquery     |
| Actor + memories join | Character card query with memory entries |
| FTS5 search           | `MATCH` on message content               |
| Migration speed       | Time to run all migrations on empty DB   |

## CI Integration

- GitHub Actions: checkout → setup-bun → `bun install` → `bun run bench` → upload artifact
- Compare against main: `bun run scripts/bench-diff.ts $MAIN_SHA ${{ github.sha }}`
- PR comment with diff output

### Thresholds

| Signal                     | Action                      |
| -------------------------- | --------------------------- |
| Any benchmark > 2x slower  | Block merge (comment on PR) |
| Any benchmark > 50% slower | Warn on PR                  |
| Under threshold            | Silent pass                 |

Configurable in `benchmarks/thresholds.json`.

## Tracking

- `data/benchmarks/` — gitignored, holds local results
- CI results uploaded as artifacts, not committed
- Compare only same-machine (local vs local, CI vs CI)

## Tooling

| Script                   | Purpose                       |
| ------------------------ | ----------------------------- |
| `scripts/bench-run.ts`   | Run suite, write JSON         |
| `scripts/bench-diff.ts`  | Compare two SHAs, print delta |
| `scripts/bench-trend.ts` | Last N results as ASCII trend |

## References

- `docs/spec/testing.md` — general testing strategy
- `tests/e2e/` — existing e2e infrastructure

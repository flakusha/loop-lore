# E2E Performance Benchmarks

Deterministic performance tracking tied to git history. Runs against real
API stack (not mocked) with fixed seed data. Output stored locally under
`data/benchmarks/` (gitignored).

## Goals

- Catch perf regressions before they ship
- Reproducible across any checkout (same git sha = same result)
- No external dashboard or alerting pipeline — diff script is enough
- Minimal setup: no prometheus, no grafana, no SaaS

## Benchmark Structure

### Output Format

Each run produces one JSON file:

```
data/benchmarks/<git-short-sha>.json
```

Schema:

```json
{
  "gitSha": "a1b2c3d4",
  "timestamp": "2026-07-16T12:00:00Z",
  "machine": { "cpu": "AMD Ryzen 7", "ram": "32GB", "os": "linux" },
  "results": {
    "api": {
      "chatCreateAndSend": { "p50_ms": 12, "p95_ms": 28, "p99_ms": 45, "ops_per_sec": 83 },
      "messageList100": { "p50_ms": 8, "p95_ms": 15, "p99_ms": 22, "ops_per_sec": 125 },
      "characterList50": { "p50_ms": 5, "p95_ms": 10, "p99_ms": 14, "ops_per_sec": 200 },
      "assetUpload1MB": { "p50_ms": 95, "p95_ms": 180, "p99_ms": 240, "ops_per_sec": 10 }
    },
    "db": {
      "messageInsertBatch": { "p50_ms": 3, "p95_ms": 6, "p99_ms": 9, "ops_per_sec": 333 },
      "chatWithMessagesJoin": { "p50_ms": 15, "p95_ms": 25, "p99_ms": 35, "ops_per_sec": 66 }
    }
  }
}
```

### Determinism Requirements

To guarantee same result on same git sha:

- Fixed seed data with deterministic UUIDs (same pattern as current e2e seed)
- In-memory SQLite database (`:memory:`)
- No network calls — mock LLM providers with fixed-latency responses
- Fixed iteration count per benchmark (no adaptive sampling)
- Warmup phase discarded, measurement phase fixed-size
- Single-threaded execution (no parallel benchmark workers)

### Diff Script

```bash
# Compare current HEAD against previous commit
bun run scripts/bench-diff.ts HEAD~1 HEAD

# Compare two arbitrary commits
bun run scripts/bench-diff.ts abc1234 def5678
```

Output:

```
benchmark: api.chatCreateAndSend
  abc1234:  p50=12ms  p95=28ms  p99=45ms
  def5678:  p50=11ms  p95=27ms  p99=44ms
  delta:    -8% p50, -4% p95, -2% p99

benchmark: db.messageInsertBatch
  abc1234:  p50=3ms   p95=6ms   p99=9ms
  def5678:  p50=9ms   p95=18ms  p99=27ms
  delta:    +200% p50, +200% p95, +200% p99  ⚠️ REGRESSION
```

## Benchmark Categories

### API Benchmarks

| Benchmark             | What It Measures                          |
| --------------------- | ----------------------------------------- |
| Chat CRUD             | Create, list, get, update, delete latency |
| Message send          | Single message POST → stored latency      |
| Message list          | List 100/1000 messages (pagination)       |
| Character list        | Grid query with tags/filters              |
| Asset upload (1 MB)   | Upload + store + metadata extraction      |
| Asset download (1 MB) | Read from disk + stream latency           |
| Generation start      | Time from POST → first SSE token          |
| Multi-user auth       | Login + session lookup latency            |

### DB Benchmarks

| Benchmark             | What It Measures                         |
| --------------------- | ---------------------------------------- |
| Message insert batch  | 100-message bulk insert                  |
| Chat + messages join  | Chat list with last-message subquery     |
| Actor + memories join | Character card query with memory entries |
| Full-text search      | FTS5 `MATCH` on message content          |
| Migration speed       | Time to run all migrations on empty DB   |

## CI Integration

### GitHub Actions

````yaml
benchmarks:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v1
    - run: bun install
    - run: bun run bench
    - name: Upload benchmark artifact
      uses: actions/upload-artifact@v4
      with:
        name: benchmark-${{ github.sha }}
        path: data/benchmarks/
    - name: Compare against main
      run: |
        git fetch origin main
        MAIN_SHA=$(git rev-parse origin/main)
        bun run scripts/bench-diff.ts $MAIN_SHA ${{ github.sha }} > bench-diff.txt
    - name: Comment on PR
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v7
      with:
        script: |
          const fs = require('fs');
          const diff = fs.readFileSync('bench-diff.txt', 'utf8');
          github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body: '```\n' + diff + '\n```' });
````

### Thresholds

| Signal                     | Action                      |
| -------------------------- | --------------------------- |
| Any benchmark > 2x slower  | Block merge (comment on PR) |
| Any benchmark > 50% slower | Warn on PR                  |
| Under threshold            | Silent pass                 |

Thresholds configurable in `benchmarks/thresholds.json`.

## Local Usage

```bash
# Run all benchmarks
bun run bench

# Run specific category
bun run bench -- api

# Compare two commits
bun run scripts/bench-diff.ts HEAD~5 HEAD

# View trend (last 10 commits)
bun run scripts/bench-trend.ts
```

## Discrepancy Tracking

Storage model for local vs CI benchmark data:

- `data/benchmarks/` — gitignored, holds local benchmark results
- `data/benchmarks/` on CI — uploaded as artifacts, not committed
- Comparison always: local run vs local run, or CI run vs CI run
- Never compare local machine against CI (hardware skews results)
- Trend detection: compare against last N runs on same machine

## Tooling

| Script                   | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `scripts/bench-run.ts`   | Run benchmark suite, write JSON to data/ |
| `scripts/bench-diff.ts`  | Compare two git shas, print delta        |
| `scripts/bench-trend.ts` | Show last N results as ASCII trend       |

## References

- `docs/spec/testing.md` — general testing strategy, coverage goals
- `tests/e2e/` — existing e2e test infrastructure (server/client helpers)
- `data/` — runtime data directory (benchmarks gitignored inside)

# Fuzzing Input Generation Strategy

## Overview

Systematic approach to generating diverse, malicious, and edge-case inputs for fuzzing all external interfaces.

---

## Input Categories

### 1. Structured Data Fuzzing (JSON/MessagePack/Protobuf)

**Targets**: All REST endpoints, WebSocket messages, IPC

**Generators**:

- **Type-aware mutation**: Start from valid schema, mutate fields
  - Field deletion, addition, type change
  - Nested object/array corruption
  - Unicode injection in strings
- **Schema violation**:
  - Required field removal
  - Enum value out of range
  - Array length: 0, 1, max+1, 10000+
  - Integer overflow: INT_MAX, INT_MIN, UINT_MAX
  - Float special values: NaN, Infinity, -Infinity, -0.0

**Tools**: `fast-check`, custom schema-driven mutator

---

### 2. Text/Protocol Fuzzing

**Targets**: Chat messages, LLM prompts, command parsers, regex extractors

**Generators**:

- **Grammar-based**:
  - Valid grammar + systematic rule violations
  - Recursive descent with depth limits
  - Left-recursion stress
- **Encoding attacks**:
  - UTF-8 overlong sequences
  - Invalid surrogate pairs
  - BOM insertion
  - Null bytes in strings
- **Injection payloads**:
  - SQL: `' OR 1=1--`, `'; DROP TABLE--`
  - NoSQL: `{$ne: null}`, `{$where: "sleep(1000)"}`
  - Command: `$(rm -rf /)`, `; cat /etc/passwd`
  - Path traversal: `../../../etc/passwd`
  - XSS: `<script>alert(1)</script>`, `javascript:alert(1)`
  - Template: `{{7*7}}`, `${7*7}`, `#{7*7}`
  - Prompt injection: `Ignore previous instructions...`

**Tools**: `fuzzball`, custom grammar fuzzer

---

### 3. Binary/Asset Fuzzing

**Targets**: Image upload, audio/video, file metadata extraction

**Generators**:

- **Format corruption**:
  - Header magic bytes mutation
  - Chunk length overflow
  - Truncated files
  - Extra/missing chunks
  - Invalid CRC/checksums
- **Content payloads**:
  - Polyglot files (valid as multiple formats)
  - ZIP bombs (nested compression)
  - Decompression bombs (billion laughs XML)
  - EXIF/XMP injection
  - Steganography payloads

**Tools**: `zzuf`, `radamsa`, custom format mutators

---

### 4. Network/Transport Fuzzing

**Targets**: HTTP/1.1, HTTP/2, WebSocket, raw TCP

**Generators**:

- **Protocol violations**:
  - Malformed headers (missing colon, oversized)
  - Chunked encoding errors
  - HTTP/2 frame corruption
  - WebSocket frame opcode abuse
  - Pipeline/keep-alive abuse
- **State machine attacks**:
  - Out-of-order frames
  - Duplicate FIN/RST
  - Window size manipulation
  - Slowloris patterns

**Tools**: `boofuzz`, custom stateful fuzzer

---

### 5. Cryptographic Input Fuzzing

**Targets**: Key exchange, encryption/decryption, signature verification

**Generators**:

- **Key material**:
  - Invalid curve points
  - Weak keys (all zeros, small order)
  - Mismatched key types
  - Expired/revoked certificates
- **Ciphertext manipulation**:
  - Bit-flipping in ciphertext
  - Tag truncation (GCM)
  - Nonce reuse
  - Padding oracle payloads

**Tools**: Custom crypto fuzzer, `wycheproof` test vectors

---

## Generation Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Schema/    │────▶│  Base       │────▶│  Mutation   │────▶│  Validation │
│  Grammar    │     │  Corpus     │     │  Engine     │     │  & Filter   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                    │                    │
                           ▼                    ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │ Valid seeds │     │ Mutators:   │     │ - Crash     │
                    │ from prod   │     │ - bitflip   │     │ - Timeout   │
                    │ traffic     │     │ - arithmetic│     │ - Assertion │
                    │ OpenAPI     │     │ - dictionary│     │ - Memory    │
                    │ specs       │     │ - structure │     │ - Leak      │
                    └─────────────┘     └─────────────┘     └─────────────┘
```

---

## Mutation Strategies

### 1. Bitflip (Deterministic)

- Flip 1-4 bits at byte offsets 0, 1, 2, 4, 8, 16, 32, 64, 128
- Target: headers, length fields, magic bytes

### 2. Arithmetic (Deterministic)

- Add/subtract 1, 2, 4, 8, 16, 32, 64, 128 to 8/16/32-bit integers
- Target: length fields, counts, IDs, timestamps

### 3. Dictionary (Seeded)

- Known-bad strings: format strings, SQL, commands, paths
- Extracted from: CVE databases, bug reports, sanitizer outputs
- Project-specific: config keys, internal API names

### 4. Structure-Aware (Smart)

- **JSON**: Insert/delete keys, change types, duplicate keys
- **Protobuf**: Field tag corruption, wire type mismatch
- **Images**: Chunk reorder, dimension overflow, palette corruption

### 5. Cross-Over (Recombination)

- Combine fragments from 2+ valid inputs
- Splice at structure boundaries (objects, arrays, chunks)

### 6. Generative (Grammar/Schema)

- Random valid generation from schema
- Targeted invalid generation (constraint violation)

---

## Coverage-Driven Prioritization

| Priority | Target         | Strategy                         | Budget |
| -------- | -------------- | -------------------------------- | ------ |
| P0       | Auth endpoints | Structure + dict + crypto        | 40%    |
| P0       | Asset upload   | Binary + structure + polyglot    | 25%    |
| P1       | Chat/message   | Grammar + injection + unicode    | 15%    |
| P1       | LLM prompt     | Injection + unicode + length     | 10%    |
| P2       | Admin/config   | Structure + dict + auth bypass   | 5%     |
| P2       | Internal IPC   | Structure + bitflip + arithmetic | 5%     |

---

## Input Corpus Management

### Seed Collection

```bash
# From production traffic (anonymized)
mitmproxy -w traffic.har --set block_global=false
# From OpenAPI specs
swagger-codegen generate -i openapi.yaml -l fuzzer-seeds
# From unit tests
find tests -name "*.json" -o -name "*.yaml" | head -1000
```

### Corpus Minimization

- `afl-cmin` for coverage-based reduction
- Deduplicate by structural hash (AST for JSON, perceptual hash for images)
- Maintain < 10,000 seeds per target

### Corpus Evolution

- Add crashing inputs to regression corpus
- Periodically refresh from production (monthly)
- Tag seeds with metadata: source, coverage, crash-type

---

## Fuzzing Harness Requirements

### Per-Target Harness

```typescript
// Example: REST endpoint fuzzer
interface FuzzHarness {
  setup(): Promise<void>; // Initialize DB, mock services
  fuzz(input: Uint8Array,): Promise<FuzzResult>;
  teardown(): Promise<void>; // Cleanup
}

interface FuzzResult {
  status: "crash" | "timeout" | "oom" | "assertion" | "ok" | "invalid";
  coverage: CoverageMap;
  logs: string[];
  reproduction: Uint8Array; // Minimal input reproducing result
}
```

### Harness Checklist

- [ ] Deterministic initialization (fixed seeds, mock time)
- [ ] No external dependencies (mock DB, cache, LLM)
- [ ] Fast reset (< 10ms per iteration)
- [ ] Memory leak detection (heap snapshot diff)
- [ ] Coverage instrumentation (source-map aware)
- [ ] Crash deduplication (stack trace + input hash)
- [ ] Timeout handling (per-iteration budget: 1s)
- [ ] OOM handling (memory limit: 512MB)

---

## Execution Infrastructure

### Local Development

```bash
# Single target, fast feedback
bun run fuzz:target --target=chat-message --iterations=10000

# All targets, coverage report
bun run fuzz:all --report=html --corpus=./corpus
```

### CI Integration

```yaml
# .github/workflows/fuzzing.yml
jobs:
  fuzz:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    strategy:
      matrix:
        target: [auth, asset, chat, llm, admin]
    steps:
      - uses: actions/checkout@v4
      - name: Run fuzzer
        run: bun run fuzz:ci --target=${{ matrix.target }} --time=30m
      - name: Upload crashes
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: crashes-${{ matrix.target }}
          path: fuzz-artifacts/crashes/
```

### Continuous Fuzzing (Cluster)

- **Scheduler**: Distribute targets across workers
- **Corpus sync**: Centralized MinIO/S3 bucket
- **Crash triage**: Auto-group by stack trace, assign severity
- **Regression**: Nightly re-run of crash corpus

---

## Metrics & Reporting

### Per-Run Metrics

| Metric           | Target  | Alert Threshold  |
| ---------------- | ------- | ---------------- |
| Executions/sec   | > 1000  | < 100            |
| Edge coverage    | > 80%   | < 50%            |
| Unique crashes   | 0       | > 0              |
| Corpus growth    | > 5%/hr | < 1%/hr          |
| Memory stability | Flat    | > 10MB/hr growth |

### Dashboard Panels

1. **Coverage heatmap**: File × line coverage over time
2. **Crash timeline**: Count by type (assertion, OOM, timeout, segfault)
3. **Corpus evolution**: Size, diversity, new edges found
4. **Performance**: Exec/s, memory, CPU per target
5. **ROI**: Bugs found per CPU-hour

---

## Integration with Sanitizers

### Compile-Time

```bash
# Build with sanitizers
bun build --sanitize=address,undefined,memory,thread
```

### Runtime

```bash
# ASan options
ASAN_OPTIONS=detect_leaks=1:halt_on_error=0:allocator_may_return_null=1
# MSan (requires instrumented deps)
MSAN_OPTIONS=halt_on_error=0
# UBSan
UBSAN_OPTIONS=halt_on_error=0:print_stacktrace=1
```

### Fuzzer-Sanitizer Combo

- Run with ASan+UBSan for memory/UB bugs
- Run with MSan for uninitialized memory
- Run with TSan for data races (threaded targets only)

---

## Regression & Triage Process

### Crash Classification

```
CRASH
├── EXPLOITABLE (CVSS ≥ 7.0)
│   ├── RCE
│   ├── Auth bypass
│   └── Data exfiltration
├── HIGH (CVSS 4.0-6.9)
│   ├── DoS (resource exhaustion)
│   └── Logic bypass
├── MEDIUM (CVSS 0.1-3.9)
│   ├── Info leak
│   └── Input validation bypass
└── LOW (Informational)
    ├── Assertion failure (defensive)
    └── Timeout (complexity)
```

### Triage Workflow

1. **Auto-dedupe**: Group by (stack trace hash, sanitizer type)
2. **Minimize**: `afl-tmin` or custom delta-debug
3. **Classify**: Apply CVSS, assign owner
4. **Fix**: Patch + add regression test to corpus
5. **Verify**: Re-run fuzzer, confirm crash eliminated
6. **Document**: Add to security changelog

---

## Deliverables Checklist

- [ ] Fuzzing infrastructure (harness runner, corpus manager, crash deduplicator)
- [ ] Per-target harnesses (auth, asset, chat, llm, admin, IPC)
- [ ] Seed corpora (10k+ seeds per target)
- [ ] Mutation engine (bitflip, arithmetic, dictionary, structure, crossover, generative)
- [ ] CI integration (GitHub Actions + artifact upload)
- [ ] Continuous fuzzing cluster (scheduler, corpus sync, crash triage)
- [ ] Dashboard (coverage, crashes, corpus, performance, ROI)
- [ ] Sanitizer integration (ASan, MSan, UBSan, TSan)
- [ ] Regression process (classification, minimization, fix verification)
- [ ] Documentation (runbooks, target guides, triage playbook)

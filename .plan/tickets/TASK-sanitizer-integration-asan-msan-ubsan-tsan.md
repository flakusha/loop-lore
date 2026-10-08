<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Sanitizer integration — ASan, MSan, UBSan, TSan

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Integrate LLVM/Clang sanitizers into fuzzing targets: ASan (address safety, heap-buffer-overflow, use-after-free, double-free), MSan (undefined memory use), UBSan (undefined behavior — signed integer overflow, null deref, misalignment), TSan (thread data races, deadlock detection). Each sanitizer requires a separate build variant. Sanitizer findings route to crash dedup and triage pipeline.覆盖率 instrumentation must be source-map aware per the harness requirements.

**Context:**

Sanitizers catch memory-safety bugs (heap overflow, use-after-free, data races) that fuzzing can trigger but that JavaScript/TypeScript runtimes normally suppress. ASan, MSan, UBSan, and TSan each cover distinct bug classes and require separate build variants with instrumentation enabled at compile time. Integrating them routes findings into the crash deduplication and triage pipeline, extending the fuzzer's reach beyond logic bugs into memory-safety bugs.

Critical constraint: the project runs on Bun (a JavaScriptCore/V8 derivative), not a native C/C++ toolchain. ASan, MSan, UBSan, and TSan are LLVM/Clang instruments that apply to native binaries — they do not attach to Bun's JS execution by default. Bun's own memory safety tools (if any) must be evaluated before assuming these sanitizers apply. If Bun's runtime cannot be instrumented with LLVM sanitizers, this ticket's scope must be redefined around Bun-compatible leak detection and runtime assertions. This is a real and important constraint, not an implementation detail.

Alternative: skip sanitizer integration entirely and rely on fuzzing to catch logic bugs only. Accepted only if Bun's runtime prevents sanitizer instrumentation — memory-safety bugs are a real and serious bug class that sanitizers catch that fuzzing alone cannot.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

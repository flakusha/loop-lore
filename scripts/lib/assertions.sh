#!/usr/bin/env bash
# scripts/lib/assertions.sh — Shared test assertion functions
# Source this file: source "$(dirname "$0")/lib/assertions.sh"
# Requires: colors.sh sourced first

PASS=0
FAIL=0

pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASS=$((PASS + 1))
}

fail() {
    echo -e "  ${RED}✗${NC} $1"
    FAIL=$((FAIL + 1))
}

assert_eq() {
    local expected="$1"
    local actual="$2"
    local label="${3:-}"
    if [[ "$expected" == "$actual" ]]; then
        pass "${label:+$label: }expected '$expected'"
    else
        fail "${label:+$label: }expected '$expected', got '$actual'"
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local label="${3:-}"
    if [[ "$haystack" == *"$needle"* ]]; then
        pass "${label:+$label: }contains '$needle'"
    else
        fail "${label:+$label: }does not contain '$needle'"
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local label="${3:-}"
    if [[ "$haystack" != *"$needle"* ]]; then
        pass "${label:+$label: }does not contain '$needle'"
    else
        fail "${label:+$label: }unexpectedly contains '$needle'"
    fi
}

assert_exit_nonzero() {
    local label="${1:-}"
    if [[ $? -ne 0 ]]; then
        pass "${label:+$label: }exit code non-zero"
    else
        fail "${label:+$label: }exit code was zero"
    fi
}

assert_file_exists() {
    local path="$1"
    local label="${2:-}"
    if [[ -f "$path" ]]; then
        pass "${label:+$label: }file exists: $(basename "$path")"
    else
        fail "${label:+$label: }file missing: $path"
    fi
}

assert_dir_exists() {
    local path="$1"
    local label="${2:-}"
    if [[ -d "$path" ]]; then
        pass "${label:+$label: }dir exists: $(basename "$path")"
    else
        fail "${label:+$label: }dir missing: $path"
    fi
}

print_results() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    local total=$((PASS + FAIL))
    echo -e "${GREEN}$PASS${NC} passed, ${RED}$FAIL${NC} failed, $total total"
    if [[ $FAIL -gt 0 ]]; then
        echo -e "${RED}SOME TESTS FAILED${NC}"
        return 1
    else
        echo -e "${GREEN}ALL TESTS PASSED${NC}"
        return 0
    fi
}

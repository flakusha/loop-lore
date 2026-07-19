#!/usr/bin/env bash
# Parallel check runner for loop-lore
# Runs independent checks in parallel and aggregates results
# Usage: ./scripts/check-parallel.sh [--fix] [--ci]

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Temp directory for parallel outputs
TMPDIR="${TMPDIR:-/tmp}/loop-lore-checks-$$"
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

# Parse args
FIX_MODE=false
CI_MODE=false
for arg in "$@"; do
    case $arg in
    --fix) FIX_MODE=true ;;
    --ci) CI_MODE=true ;;
    esac
done

# Track results
declare -A RESULTS
TOTAL=0
PASSED=0
FAILED=0
WARNINGS=0

# Run a check in background, capture output
run_check() {
    local name="$1"
    local cmd="$2"
    local output_file="$TMPDIR/$name.log"
    local exit_file="$TMPDIR/$name.exit"

    echo -e "${CYAN}Starting: ${name}${NC}" >&2

    # Run in background
    (
        if eval "$cmd" >"$output_file" 2>&1; then
            echo "0" >"$exit_file"
        else
            echo "$?" >"$exit_file"
        fi
    ) &
}

# Wait for all background checks and collect results
wait_and_collect() {
    local pids=("$@")

    # Wait for all background processes
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    # Collect results
    for check in "${!RESULTS[@]}"; do
        local output_file="$TMPDIR/$check.log"
        local exit_file="$TMPDIR/$check.exit"

        TOTAL=$((TOTAL + 1))

        if [[ -f "$exit_file" ]]; then
            local exit_code
            exit_code=$(cat "$exit_file")

            if [[ "$exit_code" == "0" ]]; then
                PASSED=$((PASSED + 1))
                echo -e "${GREEN}✓ PASS: ${check}${NC}"
            else
                FAILED=$((FAILED + 1))
                echo -e "${RED}✗ FAIL: ${check}${NC}"
                echo -e "${RED}Output:${NC}"
                cat "$output_file" | head -50
                echo ""
            fi
        else
            FAILED=$((FAILED + 1))
            echo -e "${RED}✗ FAIL: ${check} (no exit file)${NC}"
        fi
    done
}

# Define checks
declare -A CHECKS

# Type checking
CHECKS[typecheck - backend]="bun run typecheck"
CHECKS[typecheck - frontend]="bun run typecheck:frontend"
CHECKS[typecheck - coverage]="bun run typecheck:coverage"
CHECKS[typecheck - coverage - frontend]="bun run typecheck:coverage:frontend"

# Linting
CHECKS[lint - ts]="bun run lint"
CHECKS[lint - css]="bun run lint:css"
CHECKS[lint - html]="bun run lint:html"
CHECKS[lint - html-scripts]="bun run lint:html-scripts"
CHECKS[lint - chaining]="bun run lint:chaining"

# Formatting
CHECKS[format - dprint]="bun run format:dprint"
CHECKS[md - lint]="bun run md:lint"

echo -e "${CYAN}=== loop-lore parallel check runner ===${NC}"
echo -e "${CYAN}Running ${#CHECKS[@]} checks in parallel...${NC}"
echo ""

# Start all checks in parallel
PIDS=()
for check in "${!CHECKS[@]}"; do
    RESULTS[$check]=""
    run_check "$check" "${CHECKS[$check]}"
    PIDS+=($!)
done

# Wait and collect results
wait_and_collect "${PIDS[@]}"

# Summary
echo ""
echo -e "${CYAN}=== Summary ===${NC}"
echo -e "Total: ${TOTAL}"
echo -e "${GREEN}Passed: ${PASSED}${NC}"
echo -e "${RED}Failed: ${FAILED}${NC}"

if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}=== ${FAILED} check(s) failed ===${NC}"
    exit 1
fi

# Non-blocking: version drift check
echo ""
echo -e "${CYAN}=== Non-blocking checks ===${NC}"
LATEST_TAG=$(git tag | grep "^v" | sort -V | tail -1)
PKG_VERSION=$(bun run -p 'JSON.parse(require("fs").readFileSync("package.json","utf8")).version' 2>/dev/null || echo "")
if [[ -n "$LATEST_TAG" && -n "$PKG_VERSION" ]]; then
    TAG_VERSION="${LATEST_TAG#v}"
    if [[ "$TAG_VERSION" != "$PKG_VERSION" ]]; then
        echo -e "${YELLOW}⚠ Version drift: package.json=${PKG_VERSION}, latest tag=${TAG_VERSION}${NC}"
        echo -e "${YELLOW}  Run 'bun run version:sync' to reconcile${NC}"
    else
        echo -e "${GREEN}✓ Version in sync: ${PKG_VERSION}${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Version check skipped: no tags found${NC}"
fi

echo -e "${GREEN}=== All checks passed ===${NC}"
exit 0

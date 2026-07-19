#!/usr/bin/env bash
set -euo pipefail

# Git Management Flow — Integration Tests
# Tests scripts/worktree.sh end-to-end using a temporary git repo.
# Run: bash tests/worktree-flow.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_SH="$REPO_ROOT/scripts/worktree.sh"

# ── Shared libs ─────────────────────────────────────────────────────
# shellcheck source=/dev/null
source "$REPO_ROOT/scripts/lib/colors.sh"
# shellcheck source=/dev/null
source "$REPO_ROOT/scripts/lib/assertions.sh"

TEST_DIR=""

cleanup() {
    if [[ -n "$TEST_DIR" && -d "$TEST_DIR" ]]; then
        # Remove any worktrees still registered
        local wt_list
        wt_list=$(git -C "$TEST_DIR" worktree list --porcelain 2>/dev/null | grep "^path " | sed 's/^path //' || true)
        for wt in $wt_list; do
            git -C "$TEST_DIR" worktree remove "$wt" --force 2>/dev/null || true
        done
        rm -rf "$TEST_DIR" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ── Setup temporary repo ─────────────────────────────────────────────
setup_repo() {
    TEST_DIR=$(mktemp -d)
    git init "$TEST_DIR" --initial-branch=master >/dev/null 2>&1
    git -C "$TEST_DIR" config user.name "Test User" >/dev/null 2>&1
    git -C "$TEST_DIR" config user.email "test@example.com" >/dev/null 2>&1

    # Create initial commit
    echo "# test repo" >"$TEST_DIR/README.md"
    git -C "$TEST_DIR" add README.md >/dev/null 2>&1
    git -C "$TEST_DIR" commit -m "init: test repo" --no-gpg-sign >/dev/null 2>&1

    # Create a remote branch for cleanup tests
    git -C "$TEST_DIR" branch feature-existing >/dev/null 2>&1
}

# Run worktree.sh with test repo context
run_wt() {
    (cd "$TEST_DIR" && REPO_ROOT="$TEST_DIR" TREE_DIR="$TEST_DIR/tree" bash "$WORKTREE_SH" "$@")
}

# ── Tests ────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Git Management Flow — Integration Tests${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

setup_repo

# ── 1. branch_to_path ────────────────────────────────────────────────
echo -e "${YELLOW}1. branch_to_path${NC}"

result=$(echo "feat/my-feature" | sed 's|/|-|g')
assert_eq "feat-my-feature" "$result" "slash → dash conversion"

result=$(echo "simple-branch" | sed 's|/|-|g')
assert_eq "simple-branch" "$result" "no-slash passthrough"

result=$(echo "a/b/c/deep" | sed 's|/|-|g')
assert_eq "a-b-c-deep" "$result" "multiple slashes"

echo ""

# ── 2. cmd_new — create branch + worktree ────────────────────────────
echo -e "${YELLOW}2. cmd_new (create branch + worktree)${NC}"

run_wt new feat/test-new >/dev/null 2>&1 || true
assert_dir_exists "$TEST_DIR/tree/feat-test-new" "worktree directory created"
assert_file_exists "$TEST_DIR/tree/feat-test-new/.git" ".git exists in worktree"

branch_exists=$(git -C "$TEST_DIR" rev-parse --verify feat/test-new >/dev/null 2>&1 && echo "yes" || echo "no")
assert_eq "yes" "$branch_exists" "branch feat/test-new created"

echo ""

# ── 3. cmd_create — create worktree for existing branch ─────────────
echo -e "${YELLOW}3. cmd_create (worktree for existing branch)${NC}"

run_wt create feature-existing >/dev/null 2>&1 || true
assert_dir_exists "$TEST_DIR/tree/feature-existing" "worktree for feature-existing created"

echo ""

# ── 4. cmd_create — idempotent (already exists) ──────────────────────
echo -e "${YELLOW}4. cmd_create — idempotent${NC}"

output=$(run_wt create feature-existing 2>&1) || true
assert_contains "$output" "already exists" "reports already exists"

echo ""

# ── 5. cmd_new — error on existing branch ────────────────────────────
echo -e "${YELLOW}5. cmd_new — error on existing branch${NC}"

output=$(run_wt new feature-existing 2>&1) || true
assert_contains "$output" "already exists" "rejects existing branch name"

echo ""

# ── 6. cmd_new — error on non-existent base ─────────────────────────
echo -e "${YELLOW}6. cmd_new — error on non-existent base${NC}"

output=$(run_wt new feat/no-base non-existent-branch 2>&1) || true
assert_contains "$output" "does not exist" "rejects non-existent base"

echo ""

# ── 7. cmd_new — custom base branch ─────────────────────────────────
echo -e "${YELLOW}7. cmd_new — custom base branch${NC}"

git -C "$TEST_DIR" checkout -b custom-base >/dev/null 2>&1
echo "custom" >"$TEST_DIR/custom.txt"
git -C "$TEST_DIR" add custom.txt >/dev/null 2>&1
git -C "$TEST_DIR" commit -m "feat: custom base" --no-gpg-sign >/dev/null 2>&1
git -C "$TEST_DIR" checkout master >/dev/null 2>&1

run_wt new feat/from-custom custom-base >/dev/null 2>&1 || true
assert_dir_exists "$TEST_DIR/tree/feat-from-custom" "worktree from custom base created"
assert_file_exists "$TEST_DIR/tree/feat-from-custom/custom.txt" "custom.txt from base present"

echo ""

# ── 8. cmd_merge — merge source into branch ─────────────────────────
echo -e "${YELLOW}8. cmd_merge (merge source into branch)${NC}"

git -C "$TEST_DIR/tree/feat-test-new" checkout feat/test-new >/dev/null 2>&1
echo "new feature" >"$TEST_DIR/tree/feat-test-new/feature.txt"
git -C "$TEST_DIR/tree/feat-test-new" add feature.txt >/dev/null 2>&1
git -C "$TEST_DIR/tree/feat-test-new" commit -m "feat: add feature" --no-gpg-sign >/dev/null 2>&1

output=$(run_wt merge feat/test-new custom-base 2>&1) || true
assert_contains "$output" "Merged" "merge successful"
assert_file_exists "$TEST_DIR/tree/feat-test-new/custom.txt" "merged file present"

echo ""

# ── 9. cmd_merge — error on missing args ─────────────────────────────
echo -e "${YELLOW}9. cmd_merge — error on missing args${NC}"

output=$(run_wt merge feat/test-new 2>&1) || true
assert_contains "$output" "branch and source required" "rejects missing source"

echo ""

# ── 10. cmd_merge — error on non-existent source ─────────────────────
echo -e "${YELLOW}10. cmd_merge — error on non-existent source${NC}"

output=$(run_wt merge feat/test-new non-existent-branch 2>&1) || true
assert_contains "$output" "does not exist" "rejects non-existent source"

echo ""

# ── 11. cmd_merge — error on missing branch ──────────────────────────
echo -e "${YELLOW}11. cmd_merge — error on missing branch${NC}"

output=$(run_wt merge non-existent custom-base 2>&1) || true
assert_contains "$output" "no worktree found" "rejects missing target branch"

echo ""

# ── 12. cmd_merge — blocks dirty worktree ────────────────────────────
echo -e "${YELLOW}12. cmd_merge — blocks dirty worktree${NC}"

echo "dirty" >>"$TEST_DIR/tree/feat-test-new/feature.txt"
output=$(run_wt merge feat/test-new custom-base 2>&1) || true
assert_contains "$output" "Warning: uncommitted changes" "warns about dirty worktree"

# Clean up dirty state
git -C "$TEST_DIR/tree/feat-test-new" checkout -- feature.txt 2>/dev/null || true

echo ""

# ── 13. cmd_rebase — rebase onto target ─────────────────────────────
echo -e "${YELLOW}13. cmd_rebase (rebase onto target)${NC}"

# Ensure master has at least 2 commits for master~1 to work
echo "commit2" >"$TEST_DIR/commit2.txt"
git -C "$TEST_DIR" add commit2.txt >/dev/null 2>&1
git -C "$TEST_DIR" commit -m "chore: second commit for rebase test" --no-gpg-sign >/dev/null 2>&1

git -C "$TEST_DIR" checkout -b feat-behind master~1 >/dev/null 2>&1
echo "behind" >"$TEST_DIR/behind.txt"
git -C "$TEST_DIR" add behind.txt >/dev/null 2>&1
git -C "$TEST_DIR" commit -m "feat: behind branch" --no-gpg-sign >/dev/null 2>&1
git -C "$TEST_DIR" checkout master >/dev/null 2>&1

run_wt create feat-behind >/dev/null 2>&1 || true
assert_dir_exists "$TEST_DIR/tree/feat-behind" "worktree for feat-behind created"

output=$(run_wt rebase feat-behind master 2>&1) || true
assert_contains "$output" "Rebased" "rebase successful"

echo ""

# ── 14. cmd_rebase — error on missing args ───────────────────────────
echo -e "${YELLOW}14. cmd_rebase — error on missing args${NC}"

output=$(run_wt rebase 2>&1) || true
assert_contains "$output" "branch name required" "rejects missing branch"

echo ""

# ── 15. cmd_rebase — error on non-existent onto ──────────────────────
echo -e "${YELLOW}15. cmd_rebase — error on non-existent onto${NC}"

output=$(run_wt rebase feat-behind non-existent 2>&1) || true
assert_contains "$output" "does not exist" "rejects non-existent onto"

echo ""

# ── 16. cmd_remove — remove worktree ─────────────────────────────────
echo -e "${YELLOW}16. cmd_remove (remove worktree)${NC}"

output=$(run_wt remove feat-behind 2>&1) || true
assert_contains "$output" "Removed" "remove successful"

if [[ ! -d "$TEST_DIR/tree/feat-behind" ]]; then
    pass "worktree directory removed"
else
    fail "worktree directory still exists"
fi

echo ""

# ── 17. cmd_remove — error on missing branch ─────────────────────────
echo -e "${YELLOW}17. cmd_remove — error on missing branch${NC}"

output=$(run_wt remove non-existent 2>&1) || true
assert_contains "$output" "no worktree found" "rejects missing branch"

echo ""

# ── 18. cmd_remove — blocks dirty worktree ───────────────────────────
echo -e "${YELLOW}18. cmd_remove — blocks dirty worktree${NC}"

echo "dirty" >>"$TEST_DIR/tree/feat-test-new/feature.txt"
output=$(run_wt remove feat/test-new 2>&1) || true
assert_contains "$output" "uncommitted changes" "blocks removal of dirty worktree"

# Clean up
git -C "$TEST_DIR/tree/feat-test-new" checkout -- feature.txt 2>/dev/null || true

echo ""

# ── 19. cmd_list — list worktrees ────────────────────────────────────
echo -e "${YELLOW}19. cmd_list (list worktrees)${NC}"

output=$(run_wt list 2>&1) || true
assert_contains "$output" "Active worktrees" "shows header"
assert_contains "$output" "feat-test-new" "lists feat-test-new"
assert_contains "$output" "feature-existing" "lists feature-existing"

echo ""

# ── 20. cmd_cleanup — remove stale worktrees ─────────────────────────
echo -e "${YELLOW}20. cmd_cleanup (remove stale worktrees)${NC}"

git -C "$TEST_DIR" checkout -b stale-branch >/dev/null 2>&1
echo "stale" >"$TEST_DIR/stale.txt"
git -C "$TEST_DIR" add stale.txt >/dev/null 2>&1
git -C "$TEST_DIR" commit -m "feat: stale" --no-gpg-sign >/dev/null 2>&1
git -C "$TEST_DIR" checkout master >/dev/null 2>&1

run_wt create stale-branch >/dev/null 2>&1 || true
assert_dir_exists "$TEST_DIR/tree/stale-branch" "stale worktree created"

# Remove worktree registration, then delete branch ref directly
# (git branch -D fails when branch is checked out in a worktree)
git -C "$TEST_DIR" worktree remove "$TEST_DIR/tree/stale-branch" --force >/dev/null 2>&1 || true
git -C "$TEST_DIR" update-ref -d refs/heads/stale-branch 2>/dev/null || true

# Re-create the directory as a stale leftover (not a registered worktree)
mkdir -p "$TEST_DIR/tree/stale-branch"
echo "stale leftover" >"$TEST_DIR/tree/stale-branch/orphan.txt"

output=$(run_wt cleanup 2>&1) || true
assert_contains "$output" "Cleanup complete" "reports completion"

echo ""

# ── 21. No args — shows usage ────────────────────────────────────────
echo -e "${YELLOW}21. No args — shows usage${NC}"

output=$(run_wt 2>&1) || true
assert_contains "$output" "Usage:" "shows usage on no args"
assert_contains "$output" "create" "usage mentions create"
assert_contains "$output" "new" "usage mentions new"
assert_contains "$output" "merge" "usage mentions merge"
assert_contains "$output" "finalize" "usage mentions finalize"
assert_contains "$output" "agent-merge" "usage mentions agent-merge"

echo ""

# ── 22. Unknown command — shows usage ────────────────────────────────
echo -e "${YELLOW}22. Unknown command — shows usage${NC}"

output=$(run_wt foobar 2>&1) || true
assert_contains "$output" "Usage:" "shows usage on unknown command"

echo ""

# ── 23. sign — error on missing branch ───────────────────────────────
echo -e "${YELLOW}23. sign — error on missing branch${NC}"

output=$(run_wt sign 2>&1) || true
assert_contains "$output" "branch name required" "rejects missing branch"

echo ""

# ── 24. sign — error on non-existent worktree ────────────────────────
echo -e "${YELLOW}24. sign — error on non-existent worktree${NC}"

output=$(run_wt sign non-existent 2>&1) || true
assert_contains "$output" "no worktree found" "rejects non-existent worktree"

echo ""

# ── 25. create — error on non-existent branch ────────────────────────
echo -e "${YELLOW}25. create — error on non-existent branch${NC}"

output=$(run_wt create totally-fake-branch 2>&1) || true
assert_contains "$output" "does not exist" "rejects non-existent branch"

echo ""

# ── 26. new — blocks protected branch ────────────────────────────────
echo -e "${YELLOW}26. new — blocks protected branch${NC}"

output=$(run_wt new master 2>&1) || true
assert_contains "$output" "protected branch" "blocks creating master"

output=$(run_wt new main 2>&1) || true
assert_contains "$output" "protected branch" "blocks creating main"

echo ""

# ── 27. create — blocks protected branch ─────────────────────────────
echo -e "${YELLOW}27. create — blocks protected branch${NC}"

output=$(run_wt create master 2>&1) || true
assert_contains "$output" "protected branch" "blocks creating worktree for master"

echo ""

# ── 28. rebase — blocks protected branch ─────────────────────────────
echo -e "${YELLOW}28. rebase — blocks protected branch${NC}"

# master exists as a branch, create worktree won't work, but rebase check happens first
output=$(run_wt rebase master 2>&1) || true
assert_contains "$output" "cannot rebase protected branch" "blocks rebasing master"

echo ""

# ── 29. finalize — error on missing branch ───────────────────────────
echo -e "${YELLOW}29. finalize — error on missing branch${NC}"

output=$(run_wt finalize 2>&1) || true
assert_contains "$output" "branch name required" "rejects missing branch"

echo ""

# ── 30. finalize — error on missing worktree ─────────────────────────
echo -e "${YELLOW}30. finalize — error on missing worktree${NC}"

output=$(run_wt finalize non-existent 2>&1) || true
assert_contains "$output" "no worktree found" "rejects missing worktree"

echo ""

# ── 31. finalize — blocks protected branch ───────────────────────────
echo -e "${YELLOW}31. finalize — blocks protected branch${NC}"

# Need a worktree for master to test this — but create blocks it.
# So test via the is_protected check in finalize directly.
# Create a dummy worktree dir to make require_worktree pass, then test protection.
mkdir -p "$TEST_DIR/tree/master"
output=$(run_wt finalize master 2>&1) || true
assert_contains "$output" "protected branch" "blocks finalizing master"
rm -rf "$TEST_DIR/tree/master"

echo ""

# ── 32. finalize — blocks dirty worktree ─────────────────────────────
echo -e "${YELLOW}32. finalize — blocks dirty worktree${NC}"

echo "dirty" >>"$TEST_DIR/tree/feat-test-new/feature.txt"
output=$(run_wt finalize feat/test-new 2>&1) || true
assert_contains "$output" "Uncommitted changes" "blocks finalizing dirty worktree"

# Clean up
git -C "$TEST_DIR/tree/feat-test-new" checkout -- feature.txt 2>/dev/null || true

echo ""

# ── 33. finalize — no commits beyond base ────────────────────────────
echo -e "${YELLOW}33. finalize — no commits beyond base${NC}"

# feat/from-custom is already on top of master with no extra commits after rebase
# Actually it has the custom-base commit. Let's create a fresh one.
git -C "$TEST_DIR" checkout -b feat-no-commits master >/dev/null 2>&1
git -C "$TEST_DIR" checkout master >/dev/null 2>&1

run_wt create feat-no-commits >/dev/null 2>&1 || true
output=$(run_wt finalize feat-no-commits 2>&1) || true
assert_contains "$output" "no commits beyond" "reports no commits to merge"

echo ""

# ── 34. agent-merge — alias for finalize ─────────────────────────────
echo -e "${YELLOW}34. agent-merge — alias for finalize${NC}"

output=$(run_wt agent-merge 2>&1) || true
assert_contains "$output" "branch name required" "agent-merge requires branch name"

echo ""

# ── 35. Full lifecycle — new → commit → finalize ────────────────────
echo -e "${YELLOW}35. Full lifecycle — new → commit → finalize${NC}"

run_wt new feat/lifecycle >/dev/null 2>&1 || true
assert_dir_exists "$TEST_DIR/tree/feat-lifecycle" "lifecycle worktree created"

echo "lifecycle" >"$TEST_DIR/tree/feat-lifecycle/lifecycle.txt"
git -C "$TEST_DIR/tree/feat-lifecycle" add lifecycle.txt >/dev/null 2>&1
git -C "$TEST_DIR/tree/feat-lifecycle" commit -m "feat: lifecycle test" --no-gpg-sign >/dev/null 2>&1

# Verify it appears in list
output=$(run_wt list 2>&1) || true
assert_contains "$output" "feat-lifecycle" "appears in list"

# Finalize (skip bun checks since no package.json in test repo)
output=$(run_wt finalize feat/lifecycle 2>&1) || true
assert_contains "$output" "Finalized" "finalize successful"

# Verify worktree removed
if [[ ! -d "$TEST_DIR/tree/feat-lifecycle" ]]; then
    pass "worktree removed after finalize"
else
    fail "worktree still exists after finalize"
fi

# Verify branch merged to master
lifecycle_in_master=$(git -C "$TEST_DIR" log --oneline master | grep "lifecycle test" | head -1)
assert_contains "$lifecycle_in_master" "lifecycle test" "commit merged to master"

echo ""

# ── 36. Full lifecycle — agent-merge alias ───────────────────────────
echo -e "${YELLOW}36. Full lifecycle — agent-merge alias${NC}"

run_wt new feat/agent-merge-test >/dev/null 2>&1 || true
echo "agent-merge" >"$TEST_DIR/tree/feat-agent-merge-test/am.txt"
git -C "$TEST_DIR/tree/feat-agent-merge-test" add am.txt >/dev/null 2>&1
git -C "$TEST_DIR/tree/feat-agent-merge-test" commit -m "feat: agent merge test" --no-gpg-sign >/dev/null 2>&1

output=$(run_wt agent-merge feat/agent-merge-test 2>&1) || true
assert_contains "$output" "Finalized" "agent-merge successful"

if [[ ! -d "$TEST_DIR/tree/feat-agent-merge-test" ]]; then
    pass "worktree removed after agent-merge"
else
    fail "worktree still exists after agent-merge"
fi

echo ""

# ── 37. branches — list branches with status ─────────────────────────
echo -e "${YELLOW}37. branches — list branches with status${NC}"

output=$(run_wt branches 2>&1) || true
assert_contains "$output" "master" "lists master branch"
assert_contains "$output" "Branches" "shows header"

echo ""

# ── 38. branches — shows merged status ──────────────────────────────
echo -e "${YELLOW}38. branches — shows merged status${NC}"

# Create a branch, merge it, then check status
run_wt new feat/merged-branch >/dev/null 2>&1 || true
echo "merged" >"$TEST_DIR/tree/feat-merged-branch/merged.txt"
git -C "$TEST_DIR/tree/feat-merged-branch" add merged.txt >/dev/null 2>&1
git -C "$TEST_DIR/tree/feat-merged-branch" commit -m "feat: merged branch" --no-gpg-sign >/dev/null 2>&1
run_wt finalize feat/merged-branch --force >/dev/null 2>&1 || true

output=$(run_wt branches 2>&1) || true
assert_contains "$output" "merged" "shows merged status"

echo ""

# ── 39. branches — shows pending status ──────────────────────────────
echo -e "${YELLOW}39. branches — shows pending status${NC}"

run_wt new feat/pending-branch >/dev/null 2>&1 || true
echo "pending" >"$TEST_DIR/tree/feat-pending-branch/pending.txt"
git -C "$TEST_DIR/tree/feat-pending-branch" add pending.txt >/dev/null 2>&1
git -C "$TEST_DIR/tree/feat-pending-branch" commit -m "feat: pending branch" --no-gpg-sign >/dev/null 2>&1

output=$(run_wt branches 2>&1) || true
assert_contains "$output" "feat/pending-branch" "shows pending branch"
# "pending" or a numeric ahead count
assert_contains "$output" "pending" "shows pending status"

echo ""

# ── 40. branches — shows worktree marker ─────────────────────────────
echo -e "${YELLOW}40. branches — shows worktree marker${NC}"

output=$(run_wt branches 2>&1) || true
assert_contains "$output" "[wt]" "shows worktree marker for active worktree"

# Clean up
run_wt remove feat/pending-branch >/dev/null 2>&1 || true

echo ""

# ── 41. diff — show diff between branch and master ──────────────────
echo -e "${YELLOW}41. diff — show diff between branch and master${NC}"

run_wt new feat/diff-test >/dev/null 2>&1 || true
echo "diff content" >"$TEST_DIR/tree/feat-diff-test/diff.txt"
git -C "$TEST_DIR/tree/feat-diff-test" add diff.txt >/dev/null 2>&1
git -C "$TEST_DIR/tree/feat-diff-test" commit -m "feat: diff test" --no-gpg-sign >/dev/null 2>&1

output=$(run_wt diff feat/diff-test 2>&1) || true
assert_contains "$output" "Ahead" "shows ahead count"
assert_contains "$output" "diff.txt" "shows changed file"

# Clean up
run_wt remove feat/diff-test >/dev/null 2>&1 || true

echo ""

# ── 42. diff — error on missing branch ───────────────────────────────
echo -e "${YELLOW}42. diff — error on missing branch${NC}"

output=$(run_wt diff 2>&1) || true
assert_contains "$output" "branch name required" "rejects missing branch"

echo ""

# ── 43. diff — error on non-existent branch ──────────────────────────
echo -e "${YELLOW}43. diff — error on non-existent branch${NC}"

output=$(run_wt diff totally-fake-branch 2>&1) || true
assert_contains "$output" "not found" "rejects non-existent branch"

echo ""

# ── 44. status — show current branch status ──────────────────────────
echo -e "${YELLOW}44. status — show current branch status${NC}"

output=$(run_wt status 2>&1) || true
assert_contains "$output" "Branch" "shows branch info"
assert_contains "$output" "Working tree" "shows working tree status"

echo ""

# ── 45. status — show specific branch status ─────────────────────────
echo -e "${YELLOW}45. status — show specific branch status${NC}"

output=$(run_wt status feat/pending-branch 2>&1) || true
assert_contains "$output" "Branch status" "shows branch status header"
assert_contains "$output" "commit" "shows commit info"

echo ""

# ── 46. list — shows detailed worktree info ──────────────────────────
echo -e "${YELLOW}46. list — shows detailed worktree info${NC}"

run_wt new feat/list-detail >/dev/null 2>&1 || true

output=$(run_wt list 2>&1) || true
assert_contains "$output" "feat/list-detail" "shows branch name"
assert_contains "$output" "Active worktrees" "shows header"

# Clean up
run_wt remove feat/list-detail >/dev/null 2>&1 || true

echo ""

# ── 47. diff — shows behind count ────────────────────────────────────
echo -e "${YELLOW}47. diff — shows behind count${NC}"

# Create a branch from an older commit, then advance master
run_wt new feat/behind-test >/dev/null 2>&1 || true
echo "behind" >"$TEST_DIR/tree/feat-behind-test/behind.txt"
git -C "$TEST_DIR/tree/feat-behind-test" add behind.txt >/dev/null 2>&1
git -C "$TEST_DIR/tree/feat-behind-test" commit -m "feat: behind test" --no-gpg-sign >/dev/null 2>&1

# Add a commit to master directly
echo "master advance" >"$TEST_DIR/advance.txt"
git -C "$TEST_DIR" add advance.txt >/dev/null 2>&1
git -C "$TEST_DIR" commit -m "chore: advance master" --no-gpg-sign >/dev/null 2>&1

output=$(run_wt diff feat/behind-test 2>&1) || true
assert_contains "$output" "Behind" "shows behind count"

# Clean up
run_wt remove feat/behind-test >/dev/null 2>&1 || true

echo ""

# ── Results ──────────────────────────────────────────────────────────
print_results

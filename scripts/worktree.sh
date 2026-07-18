#!/usr/bin/env bash
set -euo pipefail

# Git worktree management for loop-lore
# Usage: ./scripts/worktree.sh <command> [args]

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TREE_DIR="$REPO_ROOT/tree"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

usage() {
    cat <<EOF
Git Worktree Management — loop-lore

Usage: $(basename "$0") <command> [args]

Commands:
  create <branch>           Create worktree for existing branch
  new <branch> [base]       Create new branch + worktree (base defaults to master)
  list                      Show all worktrees with status
  cleanup                   Remove worktrees for deleted branches
  remove <branch>           Remove specific worktree
  prs                       Create worktrees for all open PRs (needs gh auth)

Examples:
  $(basename "$0") new feature-xyz
  $(basename "$0") new feature-xyz master
  $(basename "$0") create existing-branch
  $(basename "$0") list
  $(basename "$0") cleanup
EOF
}

ensure_tree_dir() {
    mkdir -p "$TREE_DIR"
}

branch_to_path() {
    # Convert branch name to directory path (handle slashes)
    echo "$1" | sed 's|/|-|g'
}

cmd_create() {
    local branch="$1"

    if [[ -z "$branch" ]]; then
        echo -e "${RED}Error: branch name required${NC}"
        echo "Usage: $(basename "$0") create <branch>"
        exit 1
    fi

    # Check if branch exists
    if ! git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
        echo -e "${RED}Error: branch '$branch' does not exist${NC}"
        echo "Available branches:"
        git -C "$REPO_ROOT" branch --list | sed 's/^[* ]*//'
        exit 1
    fi

    local dir_name
    dir_name="$(branch_to_path "$branch")"
    local worktree_path="$TREE_DIR/$dir_name"

    if [[ -d "$worktree_path" ]]; then
        echo -e "${YELLOW}Worktree already exists: $worktree_path${NC}"
        exit 0
    fi

    ensure_tree_dir
    echo -e "${CYAN}Creating worktree for branch: $branch${NC}"
    git -C "$REPO_ROOT" worktree add "$worktree_path" "$branch"
    echo -e "${GREEN}✓ Created: $worktree_path${NC}"
    echo -e "  cd $worktree_path"
}

cmd_new() {
    local branch="$1"
    local base="${2:-master}"

    if [[ -z "$branch" ]]; then
        echo -e "${RED}Error: branch name required${NC}"
        echo "Usage: $(basename "$0") new <branch> [base]"
        exit 1
    fi

    # Check if branch already exists
    if git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
        echo -e "${YELLOW}Branch '$branch' already exists. Use 'create' instead.${NC}"
        exit 1
    fi

    # Check if base branch exists
    if ! git -C "$REPO_ROOT" rev-parse --verify "$base" >/dev/null 2>&1; then
        echo -e "${RED}Error: base branch '$base' does not exist${NC}"
        exit 1
    fi

    local dir_name
    dir_name="$(branch_to_path "$branch")"
    local worktree_path="$TREE_DIR/$dir_name"

    if [[ -d "$worktree_path" ]]; then
        echo -e "${RED}Error: directory already exists: $worktree_path${NC}"
        exit 1
    fi

    ensure_tree_dir
    echo -e "${CYAN}Creating new branch '$branch' from '$base'${NC}"
    git -C "$REPO_ROOT" worktree add -b "$branch" "$worktree_path" "$base"
    echo -e "${GREEN}✓ Created: $worktree_path${NC}"
    echo -e "  cd $worktree_path"
}

cmd_list() {
    echo -e "${CYAN}Active worktrees:${NC}"
    echo ""
    git -C "$REPO_ROOT" worktree list
    echo ""

    if [[ -d "$TREE_DIR" ]]; then
        local count
        count=$(find "$TREE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        echo -e "${CYAN}Worktrees in ./tree/:${NC} $count"
    else
        echo -e "${YELLOW}No ./tree/ directory yet${NC}"
    fi
}

cmd_cleanup() {
    if [[ ! -d "$TREE_DIR" ]]; then
        echo -e "${YELLOW}No ./tree/ directory — nothing to clean up${NC}"
        exit 0
    fi

    echo -e "${CYAN}Checking for stale worktrees...${NC}"
    local removed=0

    for worktree_path in "$TREE_DIR"/*/; do
        [[ ! -d "$worktree_path" ]] && continue

        local branch
        branch=$(git -C "$REPO_ROOT" worktree list --porcelain | \
                 grep -A 2 "path $(realpath "$worktree_path")" | \
                 grep "branch" | sed 's|branch refs/heads/||')

        if [[ -z "$branch" ]]; then
            echo -e "${YELLOW}  Skipped (detached HEAD): $worktree_path${NC}"
            continue
        fi

        # Check if branch exists on remote
        if ! git -C "$REPO_ROOT" branch -r --list "origin/$branch" >/dev/null 2>&1; then
            echo -e "${RED}  Removing stale worktree: $worktree_path (branch '$branch' not on remote)${NC}"
            git -C "$REPO_ROOT" worktree remove "$worktree_path" --force 2>/dev/null || \
                rm -rf "$worktree_path"
            ((removed++))
        else
            echo -e "${GREEN}  Kept: $worktree_path (branch '$branch' exists on remote)${NC}"
        fi
    done

    # Clean up empty directories
    find "$TREE_DIR" -type d -empty -delete 2>/dev/null || true

    echo ""
    echo -e "${GREEN}Cleanup complete: $removed worktree(s) removed${NC}"
}

cmd_remove() {
    local branch="$1"

    if [[ -z "$branch" ]]; then
        echo -e "${RED}Error: branch name required${NC}"
        echo "Usage: $(basename "$0") remove <branch>"
        exit 1
    fi

    local dir_name
    dir_name="$(branch_to_path "$branch")"
    local worktree_path="$TREE_DIR/$dir_name"

    if [[ ! -d "$worktree_path" ]]; then
        echo -e "${RED}Error: no worktree found for branch '$branch'${NC}"
        echo "Active worktrees:"
        git -C "$REPO_ROOT" worktree list
        exit 1
    fi

    echo -e "${CYAN}Removing worktree: $worktree_path${NC}"
    git -C "$REPO_ROOT" worktree remove "$worktree_path"
    echo -e "${GREEN}✓ Removed${NC}"
}

cmd_prs() {
    if ! command -v gh &>/dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) not installed${NC}"
        echo "Install: https://cli.github.com/"
        exit 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        echo -e "${RED}Error: GitHub CLI not authenticated${NC}"
        echo "Run: gh auth login"
        exit 1
    fi

    echo -e "${CYAN}Fetching open PRs...${NC}"
    local prs
    prs=$(gh pr list --json headRefName,title,number --limit 100)

    if [[ "$prs" == "[]" ]]; then
        echo -e "${YELLOW}No open PRs found${NC}"
        exit 0
    fi

    local count
    count=$(echo "$prs" | jq length)
    echo -e "Found $count open PR(s)"
    echo ""

    ensure_tree_dir
    local created=0
    local skipped=0

    for i in $(seq 0 $((count - 1))); do
        local branch title number
        branch=$(echo "$prs" | jq -r ".[$i].headRefName")
        title=$(echo "$prs" | jq -r ".[$i].title")
        number=$(echo "$prs" | jq -r ".[$i].number")

        local dir_name
        dir_name="$(branch_to_path "$branch")"
        local worktree_path="$TREE_DIR/$dir_name"

        if [[ -d "$worktree_path" ]]; then
            echo -e "${YELLOW}  Skipped: $branch (already exists)${NC}"
            ((skipped++))
            continue
        fi

        # Fetch the PR branch
        echo -e "${CYAN}  Creating worktree for PR #$number: $title${NC}"
        if git -C "$REPO_ROOT" worktree add "$worktree_path" "origin/$branch" 2>/dev/null; then
            echo -e "${GREEN}  ✓ Created: $worktree_path${NC}"
            ((created++))
        else
            echo -e "${RED}  ✗ Failed: $branch (branch not found on remote)${NC}"
        fi
    done

    echo ""
    echo -e "${GREEN}Done: $created created, $skipped skipped${NC}"
}

# Main
case "${1:-}" in
    create)
        shift
        cmd_create "${1:-}"
        ;;
    new)
        shift
        cmd_new "${1:-}" "${2:-}"
        ;;
    list)
        cmd_list
        ;;
    cleanup)
        cmd_cleanup
        ;;
    remove)
        shift
        cmd_remove "${1:-}"
        ;;
    prs)
        cmd_prs
        ;;
    *)
        usage
        exit 1
        ;;
esac

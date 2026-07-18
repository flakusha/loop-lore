#!/usr/bin/env bash
set -euo pipefail

# Git worktree management for loop-lore
# Usage: ./scripts/worktree.sh <command> [args]

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TREE_DIR="$REPO_ROOT/tree"

# Source agent credentials if available (GPG signing for worktrees)
if [[ -f "$REPO_ROOT/.credentials.env" ]]; then
    # shellcheck source=/dev/null
    source "$REPO_ROOT/.credentials.env"
fi

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
  sign <branch>             Configure GPG signing for existing worktree
  merge <branch> <source>   Merge source branch into worktree's branch
  rebase <branch> [onto]    Rebase worktree's branch onto target (default: master)
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

configure_signing() {
    local worktree_path="$1"

    if [[ -z "${AGENT_GPG_KEY_ID:-}" ]]; then
        echo -e "${YELLOW}  Skipped: AGENT_GPG_KEY_ID not set${NC}"
        return 0
    fi

    # Verify key exists in GPG keyring
    if ! gpg --list-keys "$AGENT_GPG_KEY_ID" &>/dev/null; then
        echo -e "${RED}  Error: GPG key $AGENT_GPG_KEY_ID not found in keyring${NC}"
        return 1
    fi

    echo -e "${CYAN}Configuring GPG signing for worktree...${NC}"

    # Enable commit signing (all commits in this worktree are signed)
    git -C "$worktree_path" config commit.gpgsign true

    # Set agent signing key (local to this worktree only)
    git -C "$worktree_path" config user.signingkey "$AGENT_GPG_KEY_ID"

    # Do NOT set user.name/user.email here — agent identity is provided
    # at commit time via GIT_COMMITTER_* env vars (agent-commit protocol).
    # This preserves Author=user, Committer=agent separation.

    echo -e "${GREEN}  ✓ GPG signing enabled (key: ${AGENT_GPG_KEY_ID:0:8}...)${NC}"
}

branch_to_path() {
    # Convert branch name to directory path (handle slashes)
    echo "$1" | sed 's|/|-|g'
}

find_worktree() {
    # Find worktree path for a branch name, print path or empty
    local branch="$1"
    local dir_name
    dir_name="$(branch_to_path "$branch")"
    local worktree_path="$TREE_DIR/$dir_name"

    if [[ -d "$worktree_path" ]]; then
        echo "$worktree_path"
    fi
}

require_worktree() {
    # Like find_worktree but exits with error if not found
    local branch="$1"
    local worktree_path
    worktree_path="$(find_worktree "$branch")"

    if [[ -z "$worktree_path" ]]; then
        echo -e "${RED}Error: no worktree found for branch '$branch'${NC}"
        echo "Active worktrees:"
        git -C "$REPO_ROOT" worktree list
        exit 1
    fi

    echo "$worktree_path"
}

check_dirty() {
    # Warn if worktree has uncommitted changes
    local worktree_path="$1"
    if ! git -C "$worktree_path" diff --quiet 2>/dev/null || \
       ! git -C "$worktree_path" diff --cached --quiet 2>/dev/null; then
        echo -e "${YELLOW}  Warning: uncommitted changes in worktree${NC}"
        echo -e "  Stash with: cd $worktree_path && git stash"
        return 1
    fi
    return 0
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
    configure_signing "$worktree_path"
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
    configure_signing "$worktree_path"
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

    local worktree_path
    worktree_path="$(require_worktree "$branch")"

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

cmd_sign() {
    local branch="$1"

    if [[ -z "$branch" ]]; then
        echo -e "${RED}Error: branch name required${NC}"
        echo "Usage: $(basename "$0") sign <branch>"
        exit 1
    fi

    local worktree_path
    worktree_path="$(require_worktree "$branch")"
    configure_signing "$worktree_path"
}

cmd_merge() {
    local branch="$1"
    local source="$2"

    if [[ -z "$branch" ]] || [[ -z "$source" ]]; then
        echo -e "${RED}Error: branch and source required${NC}"
        echo "Usage: $(basename "$0") merge <branch> <source>"
        echo "  Merges <source> branch into <branch>'s worktree"
        exit 1
    fi

    local worktree_path
    worktree_path="$(require_worktree "$branch")"

    # Verify source branch exists
    if ! git -C "$REPO_ROOT" rev-parse --verify "$source" >/dev/null 2>&1; then
        echo -e "${RED}Error: source branch '$source' does not exist${NC}"
        exit 1
    fi

    check_dirty "$worktree_path" || exit 1

    echo -e "${CYAN}Merging '$source' into '$branch'...${NC}"
    if git -C "$worktree_path" merge "$source" --no-edit; then
        echo -e "${GREEN}✓ Merged '$source' into '$branch'${NC}"
    else
        echo -e "${RED}✗ Merge conflicts — resolve in $worktree_path${NC}"
        exit 1
    fi
}

cmd_rebase() {
    local branch="$1"
    local onto="${2:-master}"

    if [[ -z "$branch" ]]; then
        echo -e "${RED}Error: branch name required${NC}"
        echo "Usage: $(basename "$0") rebase <branch> [onto]"
        echo "  Rebases <branch>'s worktree onto <onto> (default: master)"
        exit 1
    fi

    local worktree_path
    worktree_path="$(require_worktree "$branch")"

    # Verify onto branch exists
    if ! git -C "$REPO_ROOT" rev-parse --verify "$onto" >/dev/null 2>&1; then
        echo -e "${RED}Error: target branch '$onto' does not exist${NC}"
        exit 1
    fi

    check_dirty "$worktree_path" || exit 1

    echo -e "${CYAN}Rebasing '$branch' onto '$onto'...${NC}"
    if git -C "$worktree_path" rebase "$onto"; then
        echo -e "${GREEN}✓ Rebased '$branch' onto '$onto'${NC}"
    else
        echo -e "${RED}✗ Rebase conflicts — resolve in $worktree_path${NC}"
        echo -e "  Then: cd $worktree_path && git rebase --continue"
        echo -e "  Or:   cd $worktree_path && git rebase --abort"
        exit 1
    fi
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
    sign)
        shift
        cmd_sign "${1:-}"
        ;;
    merge)
        shift
        cmd_merge "${1:-}" "${2:-}"
        ;;
    rebase)
        shift
        cmd_rebase "${1:-}" "${2:-}"
        ;;
    prs)
        cmd_prs
        ;;
    *)
        usage
        exit 1
        ;;
esac

#!/usr/bin/env bash
set -euo pipefail

# Git worktree management for loop-lore
# Usage: ./scripts/worktree.sh <command> [args]

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TREE_DIR="${TREE_DIR:-$REPO_ROOT/tree}"

# Source agent credentials if available (GPG signing for worktrees)
# Always source from main repo, not worktree
# Walk up directory tree to find .credentials.env
find_credentials() {
    local dir="$1"
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/.credentials.env" ]]; then
            echo "$dir"
            return
        fi
        dir=$(dirname "$dir")
    done
}

MAIN_REPO_ROOT="${MAIN_REPO_ROOT:-$(find_credentials "$REPO_ROOT")}"
if [[ -n "$MAIN_REPO_ROOT" && -f "$MAIN_REPO_ROOT/.credentials.env" ]]; then
    # shellcheck source=/dev/null
    source "$MAIN_REPO_ROOT/.credentials.env"
fi

# Colors — sourced from shared lib
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/colors.sh"

PROTECTED_BRANCHES="master main"

is_protected() {
    local branch="$1"
    for protected in $PROTECTED_BRANCHES; do
        if [[ "$branch" == "$protected" ]]; then
            return 0
        fi
    done
    return 1
}

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
  finalize <branch>         Validate worktree ready, run checks, merge to master, remove
  agent-merge <branch>      Alias for finalize — merge worktree into master and clean up
  agent-commit <branch> <msg>  Create GPG-signed commit (agent MUST use this)
  list                      Show all worktrees with detailed status
  branches                  List all branches with merge/stale status
  diff <branch>             Show diff between branch and master
  status [branch]           Show branch/worktree status (current if omitted)
  cleanup                   Remove worktrees for deleted branches
  remove <branch>           Remove specific worktree (blocks if dirty)
  prs                       Create worktrees for all open PRs (needs gh auth)
  gha [branch] [--watch]    Check GitHub Actions status for branches
  tag [list|create|delete|show] [version]  Manage version tags
  changelog [--from <tag>] [--output <file>]  Generate changelog from conventional commits
  version [show|predict|bump] [--bump=type]  Version management
  verify [tag] [--generate]  Verify/generate SHA256 hashes for release artifacts
  release [--bump=type] [--dry-run]  Full release pipeline

Examples:
  $(basename "$0") new feature-xyz
  $(basename "$0") new feature-xyz master
  $(basename "$0") create existing-branch
  $(basename "$0") finalize feature-xyz
  $(basename "$0") agent-merge feature-xyz
  $(basename "$0") agent-commit feature-xyz "feat(scope): add new feature"
  $(basename "$0") list
  $(basename "$0") cleanup
  $(basename "$0") gha master
  $(basename "$0") tag create v0.2.0
  $(basename "$0") changelog --from v0.1.0
  $(basename "$0") version predict
  $(basename "$0") release --bump=minor --dry-run
EOF
}

ensure_tree_dir() {
    mkdir -p "$TREE_DIR"
}

# Create a relative symlink from worktree to main repo's ./configs/ directory.
# Worktrees share code but not gitignored files — this gives them access to
# shared config examples without copying. The config loader (src/config/load.ts)
# also resolves configs from main repo at runtime via findMainRepoRoot().
link_configs() {
    local worktree_path="$1"
    local configs_dir="$REPO_ROOT/configs"

    # Only create if main repo has configs/ and worktree doesn't already have it
    if [[ ! -d "$configs_dir" ]]; then
        return 0
    fi
    if [[ -e "$worktree_path/configs" || -L "$worktree_path/configs" ]]; then
        return 0
    fi

    # Relative symlink: tree/branch -> ../../configs
    ln -s ../../configs "$worktree_path/configs"
    echo -e "  ${CYAN}Linked configs/${NC} → ../../configs"
}

# Symlink node_modules from worktree to main repo — skips bun install entirely.
# Only useful when deps haven't diverged; if worktree needs different deps,
# remove the symlink and run `bun install` directly.
link_node_modules() {
    local worktree_path="$1"
    local root_nm="$REPO_ROOT/node_modules"

    # Skip if main repo has no node_modules
    if [[ ! -d "$root_nm" ]]; then
        return 0
    fi
    # Skip if worktree already has node_modules (real dir or symlink)
    if [[ -e "$worktree_path/node_modules" || -L "$worktree_path/node_modules" ]]; then
        return 0
    fi

    # Relative symlink: tree/branch/node_modules -> ../../node_modules
    ln -s ../../node_modules "$worktree_path/node_modules"
    echo -e "  ${CYAN}Linked node_modules/${NC} → ../../node_modules"
}

configure_signing() {
    local worktree_path="$1"

    if [[ -z "${AGENT_GPG_KEY_ID:-}" ]]; then
        echo -e "${YELLOW}  Skipped: AGENT_GPG_KEY_ID not set${NC}"
        return 0
    fi

    # Safety: never configure signing on the main repo root
    if [[ "$(realpath "$worktree_path")" == "$(realpath "$REPO_ROOT")" ]]; then
        echo -e "${RED}  Error: refusing to configure signing on main repo root${NC}"
        return 1
    fi

    # Verify key exists in GPG keyring
    if ! gpg --list-keys "$AGENT_GPG_KEY_ID" &>/dev/null; then
        echo -e "${RED}  Error: GPG key $AGENT_GPG_KEY_ID not found in keyring${NC}"
        return 1
    fi

    # Verify secret key exists (needed for signing)
    if ! gpg --list-secret-keys "$AGENT_GPG_KEY_ID" &>/dev/null; then
        echo -e "${RED}  Error: GPG secret key for $AGENT_GPG_KEY_ID not found — cannot sign${NC}"
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

# Build GPG signing flags for merge commits (sets GIT_MERGE_FLAGS array)
gpg_merge_flags() {
    GIT_MERGE_FLAGS=()
    if [[ -z "${AGENT_GPG_KEY_ID:-}" ]]; then
        return 0
    fi
    if ! gpg --list-secret-keys "$AGENT_GPG_KEY_ID" &>/dev/null; then
        return 0
    fi
    local gpg_bin="gpg"
    if [[ -x "/tmp/gpg-loopback" ]]; then
        gpg_bin="/tmp/gpg-loopback"
    fi
    GIT_MERGE_FLAGS=(-c commit.gpgsign=true -c user.signingkey="$AGENT_GPG_KEY_ID" -c "gpg.program=$gpg_bin")
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
    
    # Check if current directory IS the worktree for this branch
    local current_branch
    current_branch=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "")
    if [[ "$current_branch" == "$branch" ]]; then
        echo "$REPO_ROOT"
        return
    fi
    
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
        echo -e "${RED}Error: no worktree found for branch '$branch'${NC}" >&2
        echo "Active worktrees:" >&2
        git -C "$REPO_ROOT" worktree list >&2
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

    # Block operations on protected branches
    if is_protected "$branch"; then
        echo -e "${RED}Error: cannot create worktree for protected branch '$branch'${NC}"
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
    link_configs "$worktree_path"
    link_node_modules "$worktree_path"
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

    # Block operations on protected branches
    if is_protected "$branch"; then
        echo -e "${RED}Error: cannot create branch '$branch' — protected branch${NC}"
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
    link_configs "$worktree_path"
    link_node_modules "$worktree_path"
    echo -e "${GREEN}✓ Created: $worktree_path${NC}"
    echo -e "  cd $worktree_path"
}

cmd_list() {
    echo -e "${CYAN}Active worktrees:${NC}"
    echo ""

    local in_repo
    in_repo=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "detached")

    git -C "$REPO_ROOT" worktree list --porcelain | while IFS= read -r line; do
        if [[ "$line" == worktree\ * ]]; then
            local wt_path="${line#worktree }"
            local rel_path
            rel_path=$(realpath --relative-to="$REPO_ROOT" "$wt_path" 2>/dev/null || echo "$wt_path")
            if [[ "$rel_path" == "." ]]; then
                rel_path="(main repo)"
            fi
            echo -e "  ${GREEN}●${NC} $rel_path"
        elif [[ "$line" == branch\ * ]]; then
            local branch="${line#branch refs/heads/}"
            local marker=""
            if [[ "$branch" == "$in_repo" ]]; then
                marker=" ${YELLOW}(current)${NC}"
            fi
            echo -e "    Branch: ${CYAN}$branch${NC}$marker"
        elif [[ "$line" == HEAD\ * ]]; then
            local head="${line#HEAD }"
            echo -e "    HEAD: ${head:0:8}"
        elif [[ "$line" == "" ]]; then
            echo ""
        fi
    done

    if [[ -d "$TREE_DIR" ]]; then
        local count
        count=$(find "$TREE_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        echo -e "${CYAN}Worktrees in ./tree/:${NC} $count"
    else
        echo -e "${YELLOW}No ./tree/ directory yet${NC}"
    fi
}

cmd_branches() {
    echo -e "${CYAN}Branches:${NC}"
    echo ""

    local current
    current=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "")

    printf "  ${BOLD}%-35s %-12s %-10s %s${NC}\n" "BRANCH" "STATUS" "AHEAD" "LAST COMMIT"
    printf "  %-35s %-12s %-10s %s\n" "-----------------------------------" "------------" "----------" "-------------------"

    git -C "$REPO_ROOT" for-each-ref --sort=-committerdate --format='%(refname:short)|%(committerdate:relative)|%(subject)' refs/heads/ | while IFS='|' read -r branch date subject; do
        local status=""
        local ahead=""
        local color="$NC"

        # Check if merged into master
        if git -C "$REPO_ROOT" merge-base --is-ancestor "$branch" master 2>/dev/null; then
            status="${GREEN}merged${NC}"
        else
            # Count commits ahead
            local count
            count=$(git -C "$REPO_ROOT" rev-list --count master.."$branch" 2>/dev/null || echo "0")
            if [[ "$count" -gt 0 ]]; then
                ahead="${count}"
                status="${YELLOW}pending${NC}"
            else
                status="${RED}stale${NC}"
            fi
        fi

        # Check if has worktree
        local wt_marker=""
        if git -C "$REPO_ROOT" worktree list --porcelain | grep -q "branch refs/heads/$branch"; then
            wt_marker=" ${CYAN}[wt]${NC}"
        fi

        # Check if current
        local marker=""
        if [[ "$branch" == "$current" ]]; then
            marker=" ${YELLOW}*${NC}"
        fi

        printf "  %-35s %-22b %-10s %s\n" "$branch${marker}${wt_marker}" "$status" "$ahead" "$date"
    done
    echo ""

    # Summary
    local total merged stale pending
    total=$(git -C "$REPO_ROOT" branch --list | wc -l)
    merged=$(git -C "$REPO_ROOT" branch --merged master 2>/dev/null | grep -v "^\*" | grep -v "master" | wc -l)
    stale=$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads/ | while read b; do
        if ! git -C "$REPO_ROOT" merge-base --is-ancestor "$b" master 2>/dev/null; then
            count=$(git -C "$REPO_ROOT" rev-list --count master.."$b" 2>/dev/null || echo "0")
            if [[ "$count" -eq 0 ]]; then echo "$b"; fi
        fi
    done | wc -l)

    echo -e "  ${BOLD}Summary:${NC} $total branches, $merged merged, $stale stale (can safe-delete)"
}

cmd_diff() {
    local branch="${1:-}"
    if [[ -z "$branch" ]]; then
        echo -e "${RED}Error: branch name required${NC}"
        echo "Usage: $(basename "$0") diff <branch>"
        echo "  Shows diff between branch and master."
        exit 1
    fi

    if ! git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
        echo -e "${RED}Error: branch '$branch' not found${NC}"
        exit 1
    fi

    echo -e "${CYAN}Diff: master..$branch${NC}"
    echo ""

    local ahead
    ahead=$(git -C "$REPO_ROOT" rev-list --count master.."$branch" 2>/dev/null || echo "0")
    local behind
    behind=$(git -C "$REPO_ROOT" rev-list --count "$branch"..master 2>/dev/null || echo "0")

    echo -e "  Ahead: ${GREEN}$ahead${NC} commits"
    echo -e "  Behind: ${RED}$behind${NC} commits"
    echo ""

    if [[ "$ahead" -eq 0 && "$behind" -eq 0 ]]; then
        echo -e "${GREEN}Branch is at same commit as master.${NC}"
        return 0
    fi

    echo -e "${BOLD}Files changed:${NC}"
    git -C "$REPO_ROOT" diff --stat master.."$branch"
    echo ""

    echo -e "${BOLD}Commits:${NC}"
    git -C "$REPO_ROOT" log --oneline master.."$branch"
}

cmd_status() {
    local branch="${1:-}"

    if [[ -z "$branch" ]]; then
        # Show status of current branch
        echo -e "${CYAN}Current branch status:${NC}"
        echo ""

        local current
        current=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "detached")
        echo -e "  Branch: ${CYAN}$current${NC}"

        # Check if merged
        if git -C "$REPO_ROOT" merge-base --is-ancestor "$current" master 2>/dev/null; then
            echo -e "  Status: ${GREEN}merged into master${NC}"
        else
            local ahead
            ahead=$(git -C "$REPO_ROOT" rev-list --count master.."$current" 2>/dev/null || echo "0")
            echo -e "  Status: ${YELLOW}$ahead commit(s) ahead of master${NC}"
        fi

        # Check working tree
        if ! git -C "$REPO_ROOT" diff --quiet 2>/dev/null; then
            echo -e "  Working tree: ${RED}dirty${NC}"
            git -C "$REPO_ROOT" diff --stat | head -5
        else
            echo -e "  Working tree: ${GREEN}clean${NC}"
        fi

        # Check for worktree
        local wt_path
        wt_path=$(git -C "$REPO_ROOT" worktree list --porcelain | grep -B 2 "branch refs/heads/$current" | grep "path" | sed 's/path //')
        if [[ -n "$wt_path" ]]; then
            local rel
            rel=$(realpath --relative-to="$REPO_ROOT" "$wt_path" 2>/dev/null || echo "$wt_path")
            echo -e "  Worktree: ${CYAN}$rel${NC}"
        fi
    else
        # Show status of specific branch
        if ! git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
            echo -e "${RED}Error: branch '$branch' not found${NC}"
            exit 1
        fi

        echo -e "${CYAN}Branch status: $branch${NC}"
        echo ""

        # Check if merged
        if git -C "$REPO_ROOT" merge-base --is-ancestor "$branch" master 2>/dev/null; then
            echo -e "  Status: ${GREEN}merged into master${NC}"
        else
            local ahead
            ahead=$(git -C "$REPO_ROOT" rev-list --count master.."$branch" 2>/dev/null || echo "0")
            echo -e "  Status: ${YELLOW}$ahead commit(s) ahead of master${NC}"
        fi

        # Check if has worktree
        local wt_path
        wt_path=$(git -C "$REPO_ROOT" worktree list --porcelain | grep -B 2 "branch refs/heads/$branch" | grep "path" | sed 's/path //')
        if [[ -n "$wt_path" ]]; then
            local rel
            rel=$(realpath --relative-to="$REPO_ROOT" "$wt_path" 2>/dev/null || echo "$wt_path")
            echo -e "  Worktree: ${CYAN}$rel${NC}"

            # Check if worktree is clean
            if ! git -C "$wt_path" diff --quiet 2>/dev/null; then
                echo -e "  Working tree: ${RED}dirty${NC}"
                git -C "$wt_path" diff --stat | head -5
            else
                echo -e "  Working tree: ${GREEN}clean${NC}"
            fi
        else
            echo -e "  Worktree: ${YELLOW}none${NC}"
        fi

        # Last commit
        echo -e "  Last commit: $(git -C "$REPO_ROOT" log --oneline -1 "$branch")"
    fi
}

cmd_cleanup() {
    if [[ ! -d "$TREE_DIR" ]]; then
        echo -e "${YELLOW}No ./tree/ directory — nothing to clean up${NC}"
        return 0
    fi

    echo -e "${CYAN}Checking for stale worktrees...${NC}"
    local removed=0

    for worktree_path in "$TREE_DIR"/*/; do
        [[ ! -d "$worktree_path" ]] && continue

        local branch
        branch=$(git -C "$REPO_ROOT" worktree list --porcelain | \
                 grep -A 2 "path $(realpath "$worktree_path")" | \
                 grep "branch" | sed 's|branch refs/heads/||' || true)

        if [[ -z "$branch" ]]; then
            echo -e "${YELLOW}  Skipped (detached HEAD): $worktree_path${NC}"
            continue
        fi

        # Check if branch still exists locally
        if ! git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
            echo -e "${RED}  Removing stale worktree: $worktree_path (branch '$branch' deleted)${NC}"
            git -C "$REPO_ROOT" worktree remove "$worktree_path" 2>/dev/null || true
            removed=$((removed + 1))
        else
            echo -e "${GREEN}  Kept: $worktree_path (branch '$branch' exists)${NC}"
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

    # Block removal if worktree has uncommitted changes
    if ! git -C "$worktree_path" diff --quiet 2>/dev/null || \
       ! git -C "$worktree_path" diff --cached --quiet 2>/dev/null; then
        echo -e "${RED}Error: worktree has uncommitted changes${NC}"
        echo -e "  Stash or commit first: cd $worktree_path && git stash"
        echo -e "  Or use: git -C $worktree_path diff --stat"
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

    if ! (gh auth status 2>&1 || true) | grep -q "Logged in to"; then
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
            link_configs "$worktree_path"
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

    local GIT_MERGE_FLAGS=()
    gpg_merge_flags

    echo -e "${CYAN}Merging '$source' into '$branch'...${NC}"
    if git -C "$worktree_path" "${GIT_MERGE_FLAGS[@]}" merge "$source" --no-edit; then
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

    # Block rebasing protected branches onto something else
    if is_protected "$branch"; then
        echo -e "${RED}Error: cannot rebase protected branch '$branch'${NC}"
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

cmd_finalize() {
    local branch="${1:-}"
    local force=false
    
    # Parse flags
    shift 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force|-f)
                force=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    if [[ -z "$branch" ]]; then
        echo -e "${RED}Error: branch name required${NC}"
        echo "Usage: $(basename "$0") finalize <branch>"
        echo "  Validates worktree is clean, runs checks, merges to master, removes worktree"
        exit 1
    fi

    # Block finalizing protected branches
    if is_protected "$branch"; then
        echo -e "${RED}Error: cannot finalize protected branch '$branch'${NC}"
        exit 1
    fi

    local worktree_path
    worktree_path="$(require_worktree "$branch")"

    echo -e "${CYAN}═══ Finalizing '$branch' ═══${NC}"
    echo ""

    # Step 1: Check for uncommitted changes
    echo -e "${CYAN}Step 1: Checking worktree state...${NC}"
    local has_changes=false
    if ! git -C "$worktree_path" diff --quiet 2>/dev/null || \
       ! git -C "$worktree_path" diff --cached --quiet 2>/dev/null; then
        has_changes=true
        echo -e "${YELLOW}  ⚠ Uncommitted changes detected${NC}"
        git -C "$worktree_path" diff --stat 2>/dev/null || true
        echo ""
        echo -e "  ${YELLOW}Commit or stash before finalizing:${NC}"
        echo -e "    cd $worktree_path && git add -A && git commit -m 'feat: ...'"
        echo -e "    cd $worktree_path && git stash"
        exit 1
    fi
    echo -e "${GREEN}  ✓ Worktree clean${NC}"
    echo ""

    # Step 2: Run typecheck + lint + format
    echo -e "${CYAN}Step 2: Running checks (bun run check)...${NC}"
    if [[ "$force" == "true" ]]; then
        echo -e "${YELLOW}  Skipped: --force flag set${NC}"
    elif command -v bun &>/dev/null && [[ -f "$worktree_path/bun.lock" || -f "$worktree_path/package.json" ]]; then
        if (cd "$worktree_path" && bun run check); then
            echo -e "${GREEN}  ✓ Checks passed${NC}"
        else
            echo -e "${RED}  ✗ Checks failed — fix before finalizing (or use --force)${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}  Skipped: bun or package.json not found${NC}"
    fi
    echo ""
    
    # Step 3: Run tests
    echo -e "${CYAN}Step 3: Running tests (bun test src/)...${NC}"
    if [[ "$force" == "true" ]]; then
        echo -e "${YELLOW}  Skipped: --force flag set${NC}"
    elif command -v bun &>/dev/null && [[ -f "$worktree_path/bun.lock" || -f "$worktree_path/package.json" ]]; then
        if (cd "$worktree_path" && bun test src/); then
            echo -e "${GREEN}  ✓ Tests passed${NC}"
        else
            echo -e "${RED}  ✗ Tests failed — fix before finalizing (or use --force)${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}  Skipped: bun or package.json not found${NC}"
    fi
    echo ""

    # Step 4: Check branch has commits beyond base
    local base="master"
    local ahead
    ahead=$(git -C "$worktree_path" rev-list --count "$base..HEAD" 2>/dev/null || echo "0")
    if [[ "$ahead" -eq 0 ]]; then
        echo -e "${YELLOW}  ⚠ Branch '$branch' has no commits beyond $base${NC}"
        echo -e "  Nothing to merge."
        exit 0
    fi
    echo -e "${GREEN}  ✓ Branch has $ahead commit(s) beyond $base${NC}"
    echo ""

    # Step 5: Merge into master
    echo -e "${CYAN}Step 5: Merging '$branch' into master...${NC}"
    local GIT_MERGE_FLAGS=()
    gpg_merge_flags
    if git -C "$REPO_ROOT" "${GIT_MERGE_FLAGS[@]}" merge "$branch" --no-edit; then
        echo -e "${GREEN}  ✓ Merged into master${NC}"
        # Verify merge commit is signed
        if [[ ${#GIT_MERGE_FLAGS[@]} -gt 0 ]]; then
            local merge_sha
            merge_sha=$(git -C "$REPO_ROOT" rev-parse HEAD)
            if git -C "$REPO_ROOT" verify-commit "$merge_sha" &>/dev/null; then
                echo -e "${GREEN}  ✓ Merge commit GPG-signed ($merge_sha)${NC}"
            else
                echo -e "${YELLOW}  ⚠ Merge commit not signed — GPG key may be locked${NC}"
            fi
        fi
    else
        echo -e "${RED}  ✗ Merge conflicts — resolve manually${NC}"
        exit 1
    fi
    echo ""

    # Step 6: Remove worktree
    echo -e "${CYAN}Step 6: Removing worktree...${NC}"
    git -C "$REPO_ROOT" worktree remove "$worktree_path"
    echo -e "${GREEN}  ✓ Worktree removed${NC}"
    echo ""

    echo -e "${GREEN}═══ Finalized '$branch' — merged to master ═══${NC}"
}

cmd_agent_merge() {
    # Alias for finalize — same behavior
    cmd_finalize "$@"
}

cmd_agent_commit() {
    # Agent commit — standardized GPG-signed commit from worktree
    # Usage: ./scripts/worktree.sh agent-commit <branch> <message>
    # Agent MUST use this instead of raw 'git commit' commands.
    local branch="$1"
    local message="$2"
    
    if [[ -z "$branch" ]] || [[ -z "$message" ]]; then
        echo -e "${RED}Error: branch and message required${NC}"
        echo "Usage: $(basename "$0") agent-commit <branch> <message>"
        echo "  Creates a GPG-signed commit in <branch>'s worktree"
        echo "  Author = worktree user, Committer = agent (from .credentials.env)"
        exit 1
    fi
    
    # Block on protected branches
    if is_protected "$branch"; then
        echo -e "${RED}Error: cannot agent-commit on protected branch '$branch'${NC}"
        exit 1
    fi
    
    local worktree_path
    worktree_path="$(require_worktree "$branch")"
    
    # Check for staged changes
    if git -C "$worktree_path" diff --cached --quiet 2>/dev/null; then
        echo -e "${RED}Error: no staged changes in worktree${NC}"
        echo "  Stage files first: cd $worktree_path && git add <files>"
        exit 1
    fi
    
    # Verify agent credentials
    if [[ -z "${AGENT_GPG_KEY_ID:-}" ]]; then
        echo -e "${RED}Error: AGENT_GPG_KEY_ID not set in .credentials.env${NC}"
        exit 1
    fi
    
    if [[ -z "${AGENT_GPG_NAME:-}" ]] || [[ -z "${AGENT_GPG_EMAIL:-}" ]]; then
        echo -e "${RED}Error: AGENT_GPG_NAME/AGENT_GPG_EMAIL not set in .credentials.env${NC}"
        exit 1
    fi
    
    # Get author from worktree's local git config
    local author_name
    local author_email
    author_name=$(git -C "$worktree_path" config user.name)
    author_email=$(git -C "$worktree_path" config user.email)
    
    if [[ -z "$author_name" ]] || [[ -z "$author_email" ]]; then
        echo -e "${RED}Error: worktree user.name/user.email not configured${NC}"
        echo "  Run: ./scripts/worktree.sh sign $branch"
        exit 1
    fi
    
    # Verify GPG key is available
    if ! gpg --list-secret-keys "$AGENT_GPG_KEY_ID" &>/dev/null; then
        echo -e "${RED}Error: GPG secret key $AGENT_GPG_KEY_ID not found${NC}"
        echo "  Run: ./scripts/gpg-unlock.sh"
        exit 1
    fi
    
    echo -e "${CYAN}Creating GPG-signed commit in '$branch'...${NC}"
    echo -e "  Author: $author_name <$author_email>"
    echo -e "  Committer: $AGENT_GPG_NAME <$AGENT_GPG_EMAIL>"
    echo -e "  GPG Key: ${AGENT_GPG_KEY_ID:0:8}..."
    
    # Execute commit with proper identity
    # --no-verify: agent MUST run checks separately before committing
    # The pre-commit hook is for manual commits; agent workflow is:
    # 1. Run bun run check && bun test src/
    # 2. ./scripts/worktree.sh agent-commit <branch> "<message>"
    GIT_COMMITTER_NAME="$AGENT_GPG_NAME" \
    GIT_COMMITTER_EMAIL="$AGENT_GPG_EMAIL" \
    git -C "$worktree_path" \
        -c user.signingkey="$AGENT_GPG_KEY_ID" \
        -c commit.gpgsign=true \
        commit -S \
        --no-verify \
        --author="$author_name <$author_email>" \
        -m "$message"
    
    # Verify signature
    local commit_sha
    commit_sha=$(git -C "$worktree_path" rev-parse HEAD)
    if git -C "$worktree_path" verify-commit "$commit_sha" &>/dev/null; then
        echo -e "${GREEN}✓ Commit created and GPG-signed: $commit_sha${NC}"
    else
        echo -e "${YELLOW}⚠ Commit created but signature verification failed${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════════
# Release & Versioning Commands
# ═══════════════════════════════════════════════════════════════════

cmd_gha() {
    # Check GitHub Actions status for branches
    # Usage: ./scripts/worktree.sh gha [branch] [--watch]
    local branch="${1:-}"
    local watch=false

    # Parse flags
    for arg in "$@"; do
        case "$arg" in
            --watch|-w) watch=true ;;
        esac
    done

    if ! command -v gh &>/dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) not installed${NC}"
        exit 1
    fi

    if ! (gh auth status 2>&1 || true) | grep -q "Logged in to"; then
        echo -e "${RED}Error: GitHub CLI not authenticated${NC}"
        echo "Run: gh auth login"
        exit 1
    fi

    echo -e "${CYAN}═══ GitHub Actions Status ═══${NC}"
    echo ""

    if [[ -n "$branch" && "$branch" != "--watch" && "$branch" != "-w" ]]; then
        # Check specific branch
        echo -e "${CYAN}Branch: $branch${NC}"
        echo ""

        local runs
        runs=$(gh run list --branch "$branch" --limit 10 --json databaseId,conclusion,displayTitle,createdAt,status 2>/dev/null || echo "[]")

        if [[ "$runs" == "[]" ]]; then
            echo -e "${YELLOW}  No workflow runs found for branch '$branch'${NC}"
            return 0
        fi

        printf "  ${BOLD}%-10s %-40s %-20s %s${NC}\n" "STATUS" "TITLE" "CONCLUSION" "CREATED"
        printf "  %-10s %-40s %-20s %s\n" "----------" "----------------------------------------" "--------------------" "--------------------"

        echo "$runs" | jq -r '.[] | "\(.status)|\(.displayTitle)|\(.conclusion // "pending")|\(.createdAt)"' | while IFS='|' read -r status title conclusion created; do
            local status_color="$YELLOW"
            local status_icon="●"
            case "$conclusion" in
                success) status_color="$GREEN"; status_icon="✓" ;;
                failure) status_color="$RED"; status_icon="✗" ;;
                cancelled) status_color="$YELLOW"; status_icon="○" ;;
                pending|in_progress) status_color="$CYAN"; status_icon="◌" ;;
            esac
            printf "  ${status_color}%-10s${NC} %-40s %-20s %s\n" "$status_icon $status" "${title:0:40}" "$conclusion" "${created:0:19}"
        done
    else
        # Check all recent runs
        echo -e "${CYAN}Recent workflow runs:${NC}"
        echo ""

        local runs
        runs=$(gh run list --limit 20 --json databaseId,conclusion,displayTitle,createdAt,status,headBranch 2>/dev/null || echo "[]")

        if [[ "$runs" == "[]" ]]; then
            echo -e "${YELLOW}  No workflow runs found${NC}"
            return 0
        fi

        printf "  ${BOLD}%-10s %-25s %-35s %-20s %s${NC}\n" "STATUS" "BRANCH" "TITLE" "CONCLUSION" "CREATED"
        printf "  %-10s %-25s %-35s %-20s %s\n" "----------" "-------------------------" "-----------------------------------" "--------------------" "--------------------"

        echo "$runs" | jq -r '.[] | "\(.status)|\(.headBranch)|\(.displayTitle)|\(.conclusion // "pending")|\(.createdAt)"' | while IFS='|' read -r status branch title conclusion created; do
            local status_color="$YELLOW"
            local status_icon="●"
            case "$conclusion" in
                success) status_color="$GREEN"; status_icon="✓" ;;
                failure) status_color="$RED"; status_icon="✗" ;;
                cancelled) status_color="$YELLOW"; status_icon="○" ;;
                pending|in_progress) status_color="$CYAN"; status_icon="◌" ;;
            esac
            printf "  ${status_color}%-10s${NC} %-25s %-35s %-20s %s\n" "$status_icon $status" "${branch:0:25}" "${title:0:35}" "$conclusion" "${created:0:19}"
        done
    fi

    echo ""

    if [[ "$watch" == "true" ]]; then
        echo -e "${CYAN}Watching for updates (Ctrl+C to stop)...${NC}"
        while true; do
            sleep 30
            clear
            cmd_gha "$branch"
        done
    fi
}

cmd_tag() {
    # Manage version tags
    # Usage: ./scripts/worktree.sh tag [list|create|delete|show] [version]
    local action="${1:-list}"
    local version="${2:-}"

    case "$action" in
        list)
            echo -e "${CYAN}Version tags:${NC}"
            echo ""

            local tags
            tags=$(git -C "$REPO_ROOT" tag --sort=-version:refname 2>/dev/null || echo "")

            if [[ -z "$tags" ]]; then
                echo -e "${YELLOW}  No tags found${NC}"
                echo -e "  Create one: $(basename "$0") tag create v0.1.0"
                return 0
            fi

            local current_version
            current_version=$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')

            printf "  ${BOLD}%-20s %-15s %-40s %s${NC}\n" "TAG" "DATE" "MESSAGE" "CURRENT"
            printf "  %-20s %-15s %-40s %s\n" "--------------------" "---------------" "----------------------------------------" "-------"

            echo "$tags" | while read -r tag; do
                local date msg marker=""
                date=$(git -C "$REPO_ROOT" log -1 --format="%as" "$tag" 2>/dev/null || echo "?")
                msg=$(git -C "$REPO_ROOT" tag -l --format='%(contents:subject)' "$tag" 2>/dev/null || echo "")
                if [[ "v$current_version" == "$tag" ]]; then
                    marker=" ${GREEN}← current${NC}"
                fi
                printf "  %-20s %-15s %-40s%b\n" "$tag" "$date" "${msg:0:40}" "$marker"
            done
            echo ""
            echo -e "  Total: $(echo "$tags" | wc -l | tr -d ' ') tag(s)"
            ;;

        create)
            if [[ -z "$version" ]]; then
                # Auto-detect version from package.json
                version="v$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')"
            fi

            # Ensure v prefix
            if [[ "$version" != v* ]]; then
                version="v$version"
            fi

            # Check if tag already exists
            if git -C "$REPO_ROOT" rev-parse "$version" >/dev/null 2>&1; then
                echo -e "${YELLOW}Tag '$version' already exists${NC}"
                git -C "$REPO_ROOT" log -1 --format="  Commit: %h %s" "$version"
                exit 1
            fi

            echo -e "${CYAN}Creating tag: $version${NC}"

            # Generate changelog for this tag
            local prev_tag
            prev_tag=$(git -C "$REPO_ROOT" tag --sort=-version:refname | head -1 || echo "")
            local range=""
            if [[ -n "$prev_tag" ]]; then
                range="$prev_tag..HEAD"
            fi

            local changelog=""
            if [[ -n "$range" ]]; then
                changelog=$(git -C "$REPO_ROOT" log --pretty=format:"- %s (%h)" --no-merges "$range" 2>/dev/null || echo "")
            else
                changelog=$(git -C "$REPO_ROOT" log --pretty=format:"- %s (%h)" --no-merges 2>/dev/null || echo "")
            fi

            # Create annotated tag
            local tag_msg="Release $version"$'\n\n'"Changelog:"$'\n'"$changelog"

            if [[ -n "${AGENT_GPG_KEY_ID:-}" ]]; then
                # Signed tag
                GIT_COMMITTER_NAME="${AGENT_GPG_NAME:-}" \
                GIT_COMMITTER_EMAIL="${AGENT_GPG_EMAIL:-}" \
                git -C "$REPO_ROOT" tag -u "$AGENT_GPG_KEY_ID" -a "$version" -m "$tag_msg"
                echo -e "${GREEN}✓ Created and GPG-signed: $version${NC}"
            else
                git -C "$REPO_ROOT" tag -a "$version" -m "$tag_msg"
                echo -e "${GREEN}✓ Created: $version${NC}"
            fi

            echo -e "  Push with: git push origin $version"
            ;;

        delete)
            if [[ -z "$version" ]]; then
                echo -e "${RED}Error: tag version required${NC}"
                echo "Usage: $(basename "$0") tag delete v0.1.0"
                exit 1
            fi

            if [[ "$version" != v* ]]; then
                version="v$version"
            fi

            if ! git -C "$REPO_ROOT" rev-parse "$version" >/dev/null 2>&1; then
                echo -e "${RED}Error: tag '$version' not found${NC}"
                exit 1
            fi

            echo -e "${CYAN}Deleting tag: $version${NC}"
            git -C "$REPO_ROOT" tag -d "$version"
            echo -e "${GREEN}✓ Deleted locally${NC}"
            echo -e "  Also delete remote: git push origin --delete $version"
            ;;

        show)
            if [[ -z "$version" ]]; then
                echo -e "${RED}Error: tag version required${NC}"
                echo "Usage: $(basename "$0") tag show v0.1.0"
                exit 1
            fi

            if [[ "$version" != v* ]]; then
                version="v$version"
            fi

            if ! git -C "$REPO_ROOT" rev-parse "$version" >/dev/null 2>&1; then
                echo -e "${RED}Error: tag '$version' not found${NC}"
                exit 1
            fi

            echo -e "${CYAN}Tag: $version${NC}"
            echo ""
            git -C "$REPO_ROOT" tag -v "$version" 2>&1 || git -C "$REPO_ROOT" show "$version" --stat
            ;;

        *)
            echo -e "${RED}Error: unknown tag action '$action'${NC}"
            echo "Usage: $(basename "$0") tag [list|create|delete|show] [version]"
            exit 1
            ;;
    esac
}

cmd_changelog() {
    # Generate changelog from conventional commits
    # Usage: ./scripts/worktree.sh changelog [--from <tag>] [--to <ref>] [--output <file>]
    local from_tag=""
    local to_ref="HEAD"
    local output_file=""
    local format="markdown"

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --from) from_tag="$2"; shift 2 ;;
            --to) to_ref="$2"; shift 2 ;;
            --output|-o) output_file="$2"; shift 2 ;;
            --format) format="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    # Auto-detect from tag if not specified
    if [[ -z "$from_tag" ]]; then
        from_tag=$(git -C "$REPO_ROOT" tag --sort=-version:refname | head -1 || echo "")
    fi

    local range=""
    if [[ -n "$from_tag" ]]; then
        range="$from_tag..$to_ref"
        echo -e "${CYAN}Changelog: $from_tag → $to_ref${NC}"
    else
        range="$to_ref"
        echo -e "${CYAN}Changelog: all commits → $to_ref${NC}"
    fi
    echo ""

    # Get current version
    local current_version
    current_version=$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')

    # Collect commits by type
    local breaking="" features="" fixes="" docs="" refactor="" chore="" other=""

    while IFS= read -r line; do
        local hash subject
        hash=$(echo "$line" | cut -d'|' -f1)
        subject=$(echo "$line" | cut -d'|' -f2-)

        if echo "$subject" | grep -qE '^feat!:' || echo "$subject" | grep -qE '^refactor!:'; then
            breaking+="- **BREAKING**: ${subject} (${hash})"$'\n'
        elif echo "$subject" | grep -qE '^feat(\(.+\))?:'; then
            features+="- ${subject} (${hash})"$'\n'
        elif echo "$subject" | grep -qE '^fix(\(.+\))?:'; then
            fixes+="- ${subject} (${hash})"$'\n'
        elif echo "$subject" | grep -qE '^docs(\(.+\))?:'; then
            docs+="- ${subject} (${hash})"$'\n'
        elif echo "$subject" | grep -qE '^refactor(\(.+\))?:'; then
            refactor+="- ${subject} (${hash})"$'\n'
        elif echo "$subject" | grep -qE '^chore(\(.+\))?:'; then
            chore+="- ${subject} (${hash})"$'\n'
        else
            other+="- ${subject} (${hash})"$'\n'
        fi
    done < <(git -C "$REPO_ROOT" log --pretty=format:"%h|%s" --no-merges "$range" 2>/dev/null)

    # Build output
    local output=""
    output+="# Changelog"$'\n\n'
    output+="## v${current_version}"$'\n\n'

    local date_str
    date_str=$(date +%Y-%m-%d)
    output+="*Released: $date_str*"$'\n\n'

    if [[ -n "$breaking" ]]; then
        output+="### ⚠ Breaking Changes"$'\n\n'
        output+="$breaking"$'\n'
    fi

    if [[ -n "$features" ]]; then
        output+="### ✨ Features"$'\n\n'
        output+="$features"$'\n'
    fi

    if [[ -n "$fixes" ]]; then
        output+="### 🐛 Bug Fixes"$'\n\n'
        output+="$fixes"$'\n'
    fi

    if [[ -n "$refactor" ]]; then
        output+="### ♻ Refactoring"$'\n\n'
        output+="$refactor"$'\n'
    fi

    if [[ -n "$docs" ]]; then
        output+="### 📚 Documentation"$'\n\n'
        output+="$docs"$'\n'
    fi

    if [[ -n "$chore" ]]; then
        output+="### 🔧 Chores"$'\n\n'
        output+="$chore"$'\n'
    fi

    if [[ -n "$other" ]]; then
        output+="### 📝 Other"$'\n\n'
        output+="$other"$'\n'
    fi

    # Output
    if [[ -n "$output_file" ]]; then
        echo "$output" > "$output_file"
        echo -e "${GREEN}✓ Changelog written to: $output_file${NC}"
    else
        echo "$output"
    fi
}

cmd_version() {
    # Version management: show, predict, or bump
    # Usage: ./scripts/worktree.sh version [show|predict|bump] [--bump=minor|patch|major]
    local action="${1:-show}"
    local bump_type=""

    # Parse args
    for arg in "$@"; do
        case "$arg" in
            --bump=*) bump_type="${arg#--bump=}" ;;
        esac
    done

    case "$action" in
        show)
            local current_version
            current_version=$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
            echo -e "${CYAN}Current version:${NC} $current_version"

            local branch
            branch=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "detached")
            echo -e "${CYAN}Branch:${NC} $branch"

            local latest_tag
            latest_tag=$(git -C "$REPO_ROOT" tag --sort=-version:refname | head -1 || echo "(none)")
            echo -e "${CYAN}Latest tag:${NC} $latest_tag"

            local ahead
            ahead=$(git -C "$REPO_ROOT" rev-list --count "${latest_tag}..HEAD" 2>/dev/null || echo "0")
            echo -e "${CYAN}Commits since tag:${NC} $ahead"
            ;;

        predict)
            if [[ -f "$REPO_ROOT/src/scripts/version-bump.ts" ]]; then
                echo -e "${CYAN}Predicted next version:${NC}"
                (cd "$REPO_ROOT" && bun run version:predict)
            else
                echo -e "${YELLOW}version-bump.ts not found — manual version management${NC}"
                local current_version
                current_version=$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
                echo -e "  Current: $current_version"
                echo -e "  Use: $(basename "$0") version bump --bump=minor"
            fi
            ;;

        bump)
            if [[ -z "$bump_type" ]]; then
                echo -e "${RED}Error: bump type required${NC}"
                echo "Usage: $(basename "$0") version bump --bump=minor"
                echo "  Types: major, minor, patch"
                exit 1
            fi

            if [[ "$bump_type" != "major" && "$bump_type" != "minor" && "$bump_type" != "patch" ]]; then
                echo -e "${RED}Error: invalid bump type '$bump_type'${NC}"
                echo "  Valid types: major, minor, patch"
                exit 1
            fi

            local current_version
            current_version=$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
            local major minor patch
            major=$(echo "$current_version" | cut -d. -f1)
            minor=$(echo "$current_version" | cut -d. -f2)
            patch=$(echo "$current_version" | cut -d. -f3)

            local new_version
            case "$bump_type" in
                major) new_version="$((major + 1)).0.0" ;;
                minor) new_version="$major.$((minor + 1)).0" ;;
                patch) new_version="$major.$minor.$((patch + 1))" ;;
            esac

            echo -e "${CYAN}Bumping version:${NC} $current_version → $new_version ($bump_type)"

            # Update package.json
            sed -i "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$REPO_ROOT/package.json"
            echo -e "${GREEN}✓ Updated package.json${NC}"

            # Commit the version bump
            git -C "$REPO_ROOT" add package.json
            if [[ -n "${AGENT_GPG_KEY_ID:-}" ]]; then
                GIT_COMMITTER_NAME="${AGENT_GPG_NAME:-}" \
                GIT_COMMITTER_EMAIL="${AGENT_GPG_EMAIL:-}" \
                git -C "$REPO_ROOT" -c user.signingkey="$AGENT_GPG_KEY_ID" -c commit.gpgsign=true \
                    commit -S --author="$AGENT_GPG_NAME <$AGENT_GPG_EMAIL>" \
                    -m "chore(release): bump version to $new_version"
            else
                git -C "$REPO_ROOT" commit -m "chore(release): bump version to $new_version"
            fi
            echo -e "${GREEN}✓ Version bump committed${NC}"
            echo -e "  Tag it: $(basename "$0") tag create v$new_version"
            ;;

        *)
            echo -e "${RED}Error: unknown version action '$action'${NC}"
            echo "Usage: $(basename "$0") version [show|predict|bump]"
            exit 1
            ;;
    esac
}

cmd_verify() {
    # Verify SHA256 hashes of release artifacts
    # Usage: ./scripts/worktree.sh verify [tag] [--generate]
    local tag="${1:-}"
    local generate=false

    for arg in "$@"; do
        case "$arg" in
            --generate|-g) generate=true ;;
        esac
    done

    if [[ -z "$tag" || "$tag" == "--generate" || "$tag" == "-g" ]]; then
        tag=$(git -C "$REPO_ROOT" tag --sort=-version:refname | head -1 || echo "")
        if [[ -z "$tag" ]]; then
            echo -e "${RED}Error: no tags found${NC}"
            exit 1
        fi
        echo -e "${CYAN}Using latest tag: $tag${NC}"
    fi

    echo -e "${CYAN}═══ Release Verification: $tag ═══${NC}"
    echo ""

    # Get the commit for this tag
    local commit_sha
    commit_sha=$(git -C "$REPO_ROOT" rev-list -n 1 "$tag" 2>/dev/null || echo "")
    if [[ -z "$commit_sha" ]]; then
        echo -e "${RED}Error: tag '$tag' not found${NC}"
        exit 1
    fi

    echo -e "${CYAN}Tag:${NC} $tag"
    echo -e "${CYAN}Commit:${NC} $commit_sha"
    echo ""

    # Verify GPG signature on tag
    echo -e "${CYAN}GPG Signature:${NC}"
    if git -C "$REPO_ROOT" verify-tag "$tag" &>/dev/null; then
        echo -e "${GREEN}  ✓ Tag is GPG-signed and verified${NC}"
    else
        echo -e "${YELLOW}  ⚠ Tag is not GPG-signed (unsigned tag)${NC}"
    fi

    # Verify commit signature
    if git -C "$REPO_ROOT" verify-commit "$commit_sha" &>/dev/null; then
        echo -e "${GREEN}  ✓ Commit is GPG-signed and verified${NC}"
    else
        echo -e "${YELLOW}  ⚠ Commit is not GPG-signed${NC}"
    fi
    echo ""

    # Generate or verify file hashes
    local hash_file=".release-hashes-${tag}.txt"

    if [[ "$generate" == "true" ]]; then
        echo -e "${CYAN}Generating release hashes...${NC}"

        # Create a clean checkout for hashing
        local tmp_dir
        tmp_dir=$(mktemp -d)
        git -C "$REPO_ROOT" archive "$tag" | tar -x -C "$tmp_dir" 2>/dev/null || true

        # Generate hashes
        (cd "$tmp_dir" && find . -type f -not -path './.git/*' | sort | xargs sha256sum) > "$REPO_ROOT/$hash_file"
        rm -rf "$tmp_dir"

        echo -e "${GREEN}✓ Hashes written to: $hash_file${NC}"
        echo ""

        # Show summary
        local file_count
        file_count=$(wc -l < "$REPO_ROOT/$hash_file")
        echo -e "  Files hashed: $file_count"
        echo ""

        # Show first few hashes
        echo -e "${BOLD}Sample hashes:${NC}"
        head -10 "$REPO_ROOT/$hash_file" | while read -r hash path; do
            echo -e "  ${hash:0:16}... $path"
        done
    else
        # Verify existing hash file
        if [[ ! -f "$REPO_ROOT/$hash_file" ]]; then
            echo -e "${YELLOW}No hash file found for $tag${NC}"
            echo -e "  Generate with: $(basename "$0") verify $tag --generate"
            return 0
        fi

        echo -e "${CYAN}Verifying file hashes...${NC}"

        local tmp_dir
        tmp_dir=$(mktemp -d)
        git -C "$REPO_ROOT" archive "$tag" | tar -x -C "$tmp_dir" 2>/dev/null || true

        local verified=0 failed=0
        while IFS= read -r line; do
            local expected_hash file_path
            expected_hash=$(echo "$line" | awk '{print $1}')
            file_path=$(echo "$line" | awk '{print $2}')

            if [[ -f "$tmp_dir/$file_path" ]]; then
                local actual_hash
                actual_hash=$(sha256sum "$tmp_dir/$file_path" | awk '{print $1}')
                if [[ "$expected_hash" == "$actual_hash" ]]; then
                    verified=$((verified + 1))
                else
                    echo -e "${RED}  ✗ MISMATCH: $file_path${NC}"
                    echo -e "    Expected: $expected_hash"
                    echo -e "    Got:      $actual_hash"
                    failed=$((failed + 1))
                fi
            else
                echo -e "${RED}  ✗ MISSING: $file_path${NC}"
                failed=$((failed + 1))
            fi
        done < "$REPO_ROOT/$hash_file"

        rm -rf "$tmp_dir"

        echo ""
        if [[ "$failed" -eq 0 ]]; then
            echo -e "${GREEN}✓ All $verified files verified successfully${NC}"
        else
            echo -e "${RED}✗ $failed file(s) failed verification${NC}"
            exit 1
        fi
    fi
}

cmd_release() {
    # Full release pipeline: version bump → tag → changelog → build → hash → GitHub release
    # Usage: ./scripts/worktree.sh release [--bump=minor|patch|major] [--dry-run]
    local bump_type="minor"
    local dry_run=false
    local skip_build=false

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --bump=*) bump_type="${1#--bump=}" ;;
            --dry-run) dry_run=true ;;
            --skip-build) skip_build=true ;;
            *) shift ;;
        esac
    done

    if ! command -v gh &>/dev/null; then
        echo -e "${RED}Error: GitHub CLI (gh) not installed${NC}"
        exit 1
    fi

    if ! (gh auth status 2>&1 || true) | grep -q "Logged in to"; then
        echo -e "${RED}Error: GitHub CLI not authenticated${NC}"
        exit 1
    fi

    echo -e "${CYAN}═══ Release Pipeline ═══${NC}"
    echo ""

    # Step 1: Version bump
    echo -e "${CYAN}Step 1: Version bump ($bump_type)...${NC}"
    if [[ "$dry_run" == "true" ]]; then
        local current_version
        current_version=$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
        local major minor patch
        major=$(echo "$current_version" | cut -d. -f1)
        minor=$(echo "$current_version" | cut -d. -f2)
        patch=$(echo "$current_version" | cut -d. -f3)
        local new_version
        case "$bump_type" in
            major) new_version="$((major + 1)).0.0" ;;
            minor) new_version="$major.$((minor + 1)).0" ;;
            patch) new_version="$major.$minor.$((patch + 1))" ;;
        esac
        echo -e "${YELLOW}  [DRY RUN] Would bump: $current_version → $new_version${NC}"
    else
        cmd_version bump "--bump=$bump_type"
    fi
    echo ""

    # Step 2: Create tag
    echo -e "${CYAN}Step 2: Create tag...${NC}"
    local new_version
    new_version=$(grep '"version"' "$REPO_ROOT/package.json" | sed 's/.*"version": "\(.*\)".*/\1/')
    local tag_name="v$new_version"

    if [[ "$dry_run" == "true" ]]; then
        echo -e "${YELLOW}  [DRY RUN] Would create tag: $tag_name${NC}"
    else
        cmd_tag create "$tag_name"
    fi
    echo ""

    # Step 3: Generate changelog
    echo -e "${CYAN}Step 3: Generate changelog...${NC}"
    local changelog_file="CHANGELOG-v${new_version}.md"
    if [[ "$dry_run" == "true" ]]; then
        echo -e "${YELLOW}  [DRY RUN] Would generate: $changelog_file${NC}"
    else
        cmd_changelog --output "$changelog_file"
        echo -e "${GREEN}✓ Changelog: $changelog_file${NC}"
    fi
    echo ""

    # Step 4: Build
    if [[ "$skip_build" == "false" ]]; then
        echo -e "${CYAN}Step 4: Build...${NC}"
        if [[ "$dry_run" == "true" ]]; then
            echo -e "${YELLOW}  [DRY RUN] Would run: bun run build${NC}"
        else
            if (cd "$REPO_ROOT" && bun run build 2>&1); then
                echo -e "${GREEN}  ✓ Build successful${NC}"
            else
                echo -e "${RED}  ✗ Build failed — release aborted${NC}"
                exit 1
            fi
        fi
    else
        echo -e "${CYAN}Step 4: Build (skipped)...${NC}"
    fi
    echo ""

    # Step 5: Generate hashes
    echo -e "${CYAN}Step 5: Generate release hashes...${NC}"
    if [[ "$dry_run" == "true" ]]; then
        echo -e "${YELLOW}  [DRY RUN] Would generate SHA256 hashes${NC}"
    else
        cmd_verify "$tag_name" --generate
    fi
    echo ""

    # Step 6: Push tag
    echo -e "${CYAN}Step 6: Push tag...${NC}"
    if [[ "$dry_run" == "true" ]]; then
        echo -e "${YELLOW}  [DRY RUN] Would push: git push origin $tag_name${NC}"
    else
        git -C "$REPO_ROOT" push origin "$tag_name"
        echo -e "${GREEN}✓ Tag pushed${NC}"
    fi
    echo ""

    # Step 7: Create GitHub Release
    echo -e "${CYAN}Step 7: Create GitHub Release...${NC}"
    if [[ "$dry_run" == "true" ]]; then
        echo -e "${YELLOW}  [DRY RUN] Would create GitHub release with changelog${NC}"
    else
        # Read changelog body for release notes
        local release_notes=""
        if [[ -f "$REPO_ROOT/$changelog_file" ]]; then
            release_notes=$(cat "$REPO_ROOT/$changelog_file")
        fi

        gh release create "$tag_name" \
            --title "Release $tag_name" \
            --notes "$release_notes" \
            "$REPO_ROOT/$hash_file" 2>/dev/null || \
        gh release create "$tag_name" \
            --title "Release $tag_name" \
            --generate-notes

        echo -e "${GREEN}✓ GitHub Release created${NC}"
    fi
    echo ""

    echo -e "${GREEN}═══ Release $tag_name complete ═══${NC}"
    if [[ "$dry_run" == "true" ]]; then
        echo -e "${YELLOW}  (dry run — no changes made)${NC}"
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
    finalize|agent-merge)
        shift
        cmd_finalize "$@"
        ;;
    agent-commit)
        shift
        cmd_agent_commit "${1:-}" "${2:-}"
        ;;
    prs)
        cmd_prs
        ;;
    branches)
        cmd_branches
        ;;
    diff)
        shift
        cmd_diff "${1:-}"
        ;;
    status)
        shift
        cmd_status "${1:-}"
        ;;
    gha)
        shift
        cmd_gha "$@"
        ;;
    tag)
        shift
        cmd_tag "$@"
        ;;
    changelog)
        shift
        cmd_changelog "$@"
        ;;
    version)
        shift
        cmd_version "$@"
        ;;
    verify)
        shift
        cmd_verify "$@"
        ;;
    release)
        shift
        cmd_release "$@"
        ;;
    *)
        usage
        exit 1
        ;;
esac

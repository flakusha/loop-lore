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

Examples:
  $(basename "$0") new feature-xyz
  $(basename "$0") new feature-xyz master
  $(basename "$0") create existing-branch
  $(basename "$0") finalize feature-xyz
  $(basename "$0") agent-merge feature-xyz
  $(basename "$0") agent-commit feature-xyz "feat(scope): add new feature"
  $(basename "$0") list
  $(basename "$0") cleanup
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
                 grep "branch" | sed 's|branch refs/heads/||')

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
    *)
        usage
        exit 1
        ;;
esac

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

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PROTECTED_BRANCHES="master main stg dev"

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
  agent-commit <branch> <msg>  Create GPG-signed commit in worktree (agent MUST use this)
  commit <msg>             Create GPG-signed commit on current branch (including master)
  list                      Show all worktrees with status
  cleanup                   Remove worktrees for deleted branches
  remove <branch>           Remove specific worktree (blocks if dirty)
  prs                       Create worktrees for all open PRs (needs gh auth)

Issue Tracking (git-issue):
  ticket <TYPE> <title> [body]        Create .plan/tickets/ file + git issue
  issues [--all] [--format FORMAT]    List issues (default: open, oneline)
  show <ID>                           Show issue details and comments
  comment <ID> -m <text>              Add comment to issue
  edit <ID> [--label/--assignee/--priority]  Edit issue metadata
  state <ID> <STATE>                  Change issue state (open/closed)
  search <PATTERN>                    Search issues by text
  attach <ID> <FILE>                  Attach file to issue comment
  attach-dir <ID> <DIR>               Attach all files in directory

Plan Sync:
  sync [--fix] [--verbose]             Sync index.json with ticket files + git issues

Aliases:
  gi                                  Shortcut for git-issue commands

Examples:
  $(basename "$0") new feature-xyz
  $(basename "$0") ticket TASK "Fix login" -l backend -l bug -p high
  $(basename "$0") ticket FEAT "Add dark mode" -e epic-ui --effort Large
  $(basename "$0") issues --all
  $(basename "$0") show TASK-001
  $(basename "$0") comment TASK-001 -m "Added description"
  $(basename "$0") attach TASK-001 ./docs/spec.md
  $(basename "$0") gi ls
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

# Configure git hooks path for worktree (absolute path so hooks resolve correctly)
configure_hooks() {
    local worktree_path="$1"
    local hooks_dir="$REPO_ROOT/.githooks"

    if [[ ! -d "$hooks_dir" ]]; then
        echo -e "${YELLOW}  Skipped: no .githooks/ directory${NC}"
        return 0
    fi

    # Use absolute path — relative paths resolve against gitdir, not worktree
    git -C "$worktree_path" config core.hooksPath "$hooks_dir"
    echo -e "${GREEN}  ✓ Hooks configured: $hooks_dir${NC}"
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

resolve_branch() {
    # Resolve a branch name or worktree directory name to the actual branch.
    # Users often pass the directory name (tree/feature-foo) instead of the
    # branch name (feature/foo). This function handles both cases.
    local input="$1"

    # Already a valid branch?
    if git -C "$REPO_ROOT" rev-parse --verify "$input" >/dev/null 2>&1; then
        echo "$input"
        return
    fi

    # Might be a directory name — find the worktree and read its HEAD
    local dir_name
    dir_name="$(branch_to_path "$input")"
    local worktree_path="$TREE_DIR/$dir_name"
    if [[ -d "$worktree_path" ]]; then
        local head_ref
        head_ref=$(git -C "$worktree_path" symbolic-ref --short HEAD 2>/dev/null || echo "")
        if [[ -n "$head_ref" ]]; then
            echo "$head_ref"
            return
        fi
    fi

    # Could not resolve
    echo ""
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
    configure_hooks "$worktree_path"
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
    configure_hooks "$worktree_path"
    echo -e "${GREEN}✓ Created: $worktree_path${NC}"
    echo -e "  cd $worktree_path"
}

cmd_ticket() {
    # Create a git-native-issue ticket with year-prefixed ID
    # Usage: ./scripts/worktree.sh ticket <TYPE> <NUM> <title> [body] [options]
    # IDs use format: TYPE-YYYY-NNN (e.g., TASK-2026-025, FEAT-2026-001)
    local type=""
    local num=""
    local title=""
    local body=""
    local labels=()
    local priority=""

    # Parse required positional args
    type="${1:-}"
    num="${2:-}"
    title="${3:-}"
    body="${4:-}"

    if [[ -z "$type" ]] || [[ -z "$num" ]] || [[ -z "$title" ]]; then
        echo -e "${RED}Error: type, number, and title required${NC}"
        echo "Usage: $(basename "$0") ticket <TYPE> <NUM> <title> [body] [options]"
        echo "  TYPE: BUG, FEAT, FIX, IDEA, TASK, SOL, INFRA, EPIC"
        echo "  NUM: 3-digit number (e.g., 025, 001)"
        echo "  IDs use format TYPE-YYYY-NNN (e.g., TASK-2026-025)"
        echo ""
        echo "Options:"
        echo "  -l, --label <label>    Add label (repeatable)"
        echo "  -p, --priority <level> Set priority: low, medium, high, critical"
        echo ""
        echo "Example: $(basename "$0") ticket TASK 025 'Fix login' -l backend -l bug -p high"
        exit 1
    fi

    # Parse optional flags (shift past the 4 positional args)
    shift 4 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -l|--label)
                labels+=("$2")
                shift 2
                ;;
            -p|--priority)
                priority="$2"
                shift 2
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                exit 1
                ;;
        esac
    done

    # Normalize type to uppercase
    type=$(echo "$type" | tr '[:lower:]' '[:upper:]')
    
    # Validate type
    case "$type" in
        BUG|FEAT|FIX|IDEA|TASK|SOL|INFRA|EPIC) ;;
        *) echo -e "${RED}Error: unknown type '$type'${NC}"; exit 1 ;;
    esac

    # Validate priority if provided
    if [[ -n "$priority" ]]; then
        case "$priority" in
            low|medium|high|critical) ;;
            *) echo -e "${RED}Error: unknown priority '$priority' (use: low, medium, high, critical)${NC}"; exit 1 ;;
        esac
    fi

    local year
    year=$(date +%Y)
    local extid="${type}-${year}-${num}"
    local full_title="${extid}: ${title}"

    # Check if already exists
    if git -C "$REPO_ROOT" issue search "${extid}:" 2>/dev/null | grep -q "${extid}:"; then
        echo -e "${YELLOW}Ticket ${extid} already exists${NC}"
        exit 0
    fi

    echo -e "${CYAN}Creating ticket: ${extid}${NC}"
    local issue_hash
    issue_hash=$(git -C "$REPO_ROOT" issue create "$full_title" -m "$body")

    # Extract issue hash from output (format: "Created issue <hash>")
    local hash
    hash=$(echo "$issue_hash" | grep -oP '[0-9a-f]{7,}')

    # Add labels if provided
    if [[ ${#labels[@]} -gt 0 ]] && [[ -n "$hash" ]]; then
        local label_cmd=(git -C "$REPO_ROOT" issue edit "$hash")
        for label in "${labels[@]}"; do
            label_cmd+=(-l "$label")
        done
        "${label_cmd[@]}"
    fi

    # Add priority if provided
    if [[ -n "$priority" ]] && [[ -n "$hash" ]]; then
        git -C "$REPO_ROOT" issue edit "$hash" -p "$priority"
    fi

    echo -e "${GREEN}✓ Created ticket ${extid}${NC}"
}

cmd_issues() {
    # List issues with optional filters
    # Usage: ./scripts/worktree.sh issues [--all] [--format FORMAT]
    local show_all=false
    local format="oneline"
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --all|-a)
                show_all=true
                shift
                ;;
            --format|-f)
                format="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    echo -e "${CYAN}Issues:${NC}"
    if [[ "$show_all" == true ]]; then
        git -C "$REPO_ROOT" issue ls --format "$format" 2>/dev/null
    else
        git -C "$REPO_ROOT" issue ls --format "$format" 2>/dev/null | head -50
    fi
}

cmd_show() {
    # Show issue details and comments
    # Usage: ./scripts/worktree.sh show <ID>
    local id="$1"
    
    if [[ -z "$id" ]]; then
        echo -e "${RED}Error: issue ID required${NC}"
        echo "Usage: $(basename "$0") show <ID>"
        exit 1
    fi
    
    # Try to find by extid pattern (e.g., TASK-001)
    if [[ "$id" =~ ^[A-Z]+-[0-9]+$ ]]; then
        # Search for the issue by title pattern
        local found_id
        found_id=$(git -C "$REPO_ROOT" issue ls 2>/dev/null | grep -m1 "${id}:" | awk '{print $1}')
        if [[ -n "$found_id" ]]; then
            id="$found_id"
        fi
    fi
    
    git -C "$REPO_ROOT" issue show "$id" 2>/dev/null
}

cmd_comment() {
    # Add comment to issue
    # Usage: ./scripts/worktree.sh comment <ID> -m <text>
    local id="$1"
    shift
    
    if [[ -z "$id" ]]; then
        echo -e "${RED}Error: issue ID required${NC}"
        echo "Usage: $(basename "$0") comment <ID> -m <text>"
        exit 1
    fi
    
    # Try to find by extid pattern (e.g., TASK-001)
    if [[ "$id" =~ ^[A-Z]+-[0-9]+$ ]]; then
        local found_id
        found_id=$(git -C "$REPO_ROOT" issue ls 2>/dev/null | grep -m1 "${id}:" | awk '{print $1}')
        if [[ -n "$found_id" ]]; then
            id="$found_id"
        fi
    fi
    
    git -C "$REPO_ROOT" issue comment "$id" "$@" 2>/dev/null
}

cmd_edit() {
    # Edit issue metadata
    # Usage: ./scripts/worktree.sh edit <ID> [--label/--assignee/--priority]
    local id="$1"
    shift
    
    if [[ -z "$id" ]]; then
        echo -e "${RED}Error: issue ID required${NC}"
        echo "Usage: $(basename "$0") edit <ID> [options]"
        exit 1
    fi
    
    # Try to find by extid pattern (e.g., TASK-001)
    if [[ "$id" =~ ^[A-Z]+-[0-9]+$ ]]; then
        local found_id
        found_id=$(git -C "$REPO_ROOT" issue ls 2>/dev/null | grep -m1 "${id}:" | awk '{print $1}')
        if [[ -n "$found_id" ]]; then
            id="$found_id"
        fi
    fi
    
    git -C "$REPO_ROOT" issue edit "$id" "$@" 2>/dev/null
}

cmd_state() {
    # Change issue state
    # Usage: ./scripts/worktree.sh state <ID> <STATE>
    local id="$1"
    local state="$2"
    
    if [[ -z "$id" ]] || [[ -z "$state" ]]; then
        echo -e "${RED}Error: issue ID and state required${NC}"
        echo "Usage: $(basename "$0") state <ID> <STATE>"
        echo "  STATE: open, closed"
        exit 1
    fi
    
    # Try to find by extid pattern (e.g., TASK-001)
    if [[ "$id" =~ ^[A-Z]+-[0-9]+$ ]]; then
        local found_id
        found_id=$(git -C "$REPO_ROOT" issue ls 2>/dev/null | grep -m1 "${id}:" | awk '{print $1}')
        if [[ -n "$found_id" ]]; then
            id="$found_id"
        fi
    fi
    
    git -C "$REPO_ROOT" issue state "$id" "$state" 2>/dev/null
}

cmd_search() {
    # Search issues by text pattern
    # Usage: ./scripts/worktree.sh search <PATTERN>
    local pattern="$1"
    
    if [[ -z "$pattern" ]]; then
        echo -e "${RED}Error: search pattern required${NC}"
        echo "Usage: $(basename "$0") search <PATTERN>"
        exit 1
    fi
    
    echo -e "${CYAN}Searching issues for: ${pattern}${NC}"
    git -C "$REPO_ROOT" issue search "$pattern" 2>/dev/null
}

cmd_attach() {
    # Attach file to issue as comment
    # Usage: ./scripts/worktree.sh attach <ID> <FILE>
    local id="$1"
    local file="$2"
    
    if [[ -z "$id" ]] || [[ -z "$file" ]]; then
        echo -e "${RED}Error: issue ID and file required${NC}"
        echo "Usage: $(basename "$0") attach <ID> <FILE>"
        exit 1
    fi
    
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}Error: file not found: $file${NC}"
        exit 1
    fi
    
    # Try to find by extid pattern (e.g., TASK-001)
    if [[ "$id" =~ ^[A-Z]+-[0-9]+$ ]]; then
        local found_id
        found_id=$(git -C "$REPO_ROOT" issue ls 2>/dev/null | grep -m1 "${id}:" | awk '{print $1}')
        if [[ -n "$found_id" ]]; then
            id="$found_id"
        fi
    fi
    
    # Read file content and create comment
    local content
    content=$(cat "$file")
    local filename
    filename=$(basename "$file")
    
    echo -e "${CYAN}Attaching $filename to issue $id...${NC}"
    git -C "$REPO_ROOT" issue comment "$id" -m "## Attachment: $filename

\`\`\`
$content
\`\`\`" 2>/dev/null
    echo -e "${GREEN}✓ Attached $filename${NC}"
}

cmd_attach_dir() {
    # Attach all files in directory to issue
    # Usage: ./scripts/worktree.sh attach-dir <ID> <DIR>
    local id="$1"
    local dir="$2"
    
    if [[ -z "$id" ]] || [[ -z "$dir" ]]; then
        echo -e "${RED}Error: issue ID and directory required${NC}"
        echo "Usage: $(basename "$0") attach-dir <ID> <DIR>"
        exit 1
    fi
    
    if [[ ! -d "$dir" ]]; then
        echo -e "${RED}Error: directory not found: $dir${NC}"
        exit 1
    fi
    
    echo -e "${CYAN}Attaching files from $dir to issue $id...${NC}"
    local count=0
    for file in "$dir"/*; do
        if [[ -f "$file" ]]; then
            cmd_attach "$id" "$file"
            ((count++))
        fi
    done
    echo -e "${GREEN}✓ Attached $count files${NC}"
}

cmd_gi() {
    # Shortcut for git-issue commands
    # Usage: ./scripts/worktree.sh gi <args>
    git -C "$REPO_ROOT" issue "$@" 2>/dev/null
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

        # Check if branch still exists locally
        if ! git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
            echo -e "${RED}  Removing stale worktree: $worktree_path (branch '$branch' deleted)${NC}"
            git -C "$REPO_ROOT" worktree remove "$worktree_path" 2>/dev/null || true
            ((removed++))
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
    configure_hooks "$worktree_path"
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
    local branch="$1"
    local force=false
    
    # Parse flags
    shift
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

    # Resolve directory names (feature-foo) to branch names (feature/foo)
    local resolved
    resolved="$(resolve_branch "$branch")"
    if [[ -n "$resolved" ]] && [[ "$resolved" != "$branch" ]]; then
        echo -e "${YELLOW}  ℹ Resolved '$branch' → branch '$resolved'${NC}"
        branch="$resolved"
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
        if (cd "$worktree_path" && unset REPO_ROOT && bun run check); then
            echo -e "${GREEN}  ✓ Checks passed${NC}"
        else
            echo -e "${RED}  ✗ Checks failed — fix before finalizing (or use --force)${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}  Skipped: bun or package.json not found${NC}"
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

  # Step 5: Merge into base branch (worktree stays until merge succeeds)
  local target_branch
  target_branch=$(git -C "$REPO_ROOT" branch --show-current)
  echo -e "${CYAN}Step 5: Merging '$branch' into $target_branch...${NC}"
  local GIT_MERGE_FLAGS=()
  gpg_merge_flags
  if git -C "$REPO_ROOT" "${GIT_MERGE_FLAGS[@]}" merge "$branch" --no-edit; then
    echo -e "${GREEN}  ✓ Merged into $target_branch${NC}"
    # Verify merge commit is signed
    local merge_sha
    merge_sha=$(git -C "$REPO_ROOT" rev-parse HEAD)
    if git -C "$REPO_ROOT" verify-commit "$merge_sha" &>/dev/null; then
      echo -e "${GREEN}  ✓ Merge commit GPG-signed ($merge_sha)${NC}"
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

    # Step 5: Merge into master (worktree stays until merge succeeds)
    echo -e "${CYAN}Step 5: Merging '$branch' into master...${NC}"
    local GIT_MERGE_FLAGS=()
    gpg_merge_flags
    if git -C "$REPO_ROOT" "${GIT_MERGE_FLAGS[@]}" merge "$branch" --no-edit; then
        echo -e "${GREEN}  ✓ Merged into master${NC}"
        # Verify merge commit is signed
        local merge_sha
        merge_sha=$(git -C "$REPO_ROOT" rev-parse HEAD)
        if git -C "$REPO_ROOT" verify-commit "$merge_sha" &>/dev/null; then
            echo -e "${GREEN}  ✓ Merge commit GPG-signed ($merge_sha)${NC}"
        else
            echo -e "${YELLOW}  ⚠ Merge commit not signed — GPG key may be locked${NC}"
        fi
    else
        echo -e "${RED}  ✗ Merge conflicts — worktree preserved at $worktree_path${NC}"
        echo -e "  Resolve conflicts, then re-run: $(basename "$0") finalize $branch"
        exit 1
    fi
    echo ""

    # Step 6: Remove worktree (only AFTER successful merge)
    echo -e "${CYAN}Step 6: Removing worktree...${NC}"
    local worktree_abs
    worktree_abs=$(cd "$worktree_path" && pwd)
    if git worktree remove "$worktree_abs" --force 2>/dev/null; then
        echo -e "${GREEN}  ✓ Worktree removed${NC}"
    else
        echo -e "${YELLOW}  ⚠ Failed to remove worktree — remove manually: git worktree remove $worktree_abs${NC}"
    fi
    echo ""

    # Step 7: Delete branch
    echo -e "${CYAN}Step 7: Deleting branch '$branch'...${NC}"
    git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || git -C "$REPO_ROOT" branch -D "$branch"
    echo -e "${GREEN}  ✓ Branch deleted${NC}"
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

cmd_commit() {
    # Direct commit on current branch — for commits on master/main
    # Usage: ./scripts/worktree.sh commit <message>
    # Author = local git user, Committer = agent (from .credentials.env)
    # Works from ANY directory — no worktree lookup.
    local message="$1"

    if [[ -z "$message" ]]; then
        echo -e "${RED}Error: commit message required${NC}"
        echo "Usage: $(basename "$0") commit <message>"
        echo "  Creates a GPG-signed commit on the current branch"
        echo "  Author = local git user, Committer = agent (from .credentials.env)"
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

    # Check for staged changes
    if git diff --cached --quiet 2>/dev/null; then
        echo -e "${RED}Error: no staged changes${NC}"
        echo "  Stage files first: git add <files>"
        exit 1
    fi

    # Get author from current git config (local or global)
    local author_name
    local author_email
    author_name=$(git config user.name)
    author_email=$(git config user.email)

    if [[ -z "$author_name" ]] || [[ -z "$author_email" ]]; then
        echo -e "${RED}Error: git user.name/user.email not configured${NC}"
        echo "  Run: git config user.name 'Your Name' && git config user.email 'you@example.com'"
        exit 1
    fi

    # Verify GPG key is available
    if ! gpg --list-secret-keys "$AGENT_GPG_KEY_ID" &>/dev/null; then
        echo -e "${RED}Error: GPG secret key $AGENT_GPG_KEY_ID not found${NC}"
        echo "  Run: ./scripts/gpg-unlock.sh"
        exit 1
    fi

    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "(detached)")

    echo -e "${CYAN}Creating GPG-signed commit on '$current_branch'...${NC}"
    echo -e "  Author: $author_name <$author_email>"
    echo -e "  Committer: $AGENT_GPG_NAME <$AGENT_GPG_EMAIL>"
    echo -e "  GPG Key: ${AGENT_GPG_KEY_ID:0:8}..."

    # Execute commit with proper identity
    # --no-verify: agent MUST run checks separately before committing
    GIT_COMMITTER_NAME="$AGENT_GPG_NAME" \
    GIT_COMMITTER_EMAIL="$AGENT_GPG_EMAIL" \
    git \
        -c user.signingkey="$AGENT_GPG_KEY_ID" \
        -c commit.gpgsign=true \
        commit -S \
        --no-verify \
        --author="$author_name <$author_email>" \
        -m "$message"

    # Verify signature
    local commit_sha
    commit_sha=$(git rev-parse HEAD)
    if git verify-commit "$commit_sha" &>/dev/null; then
        echo -e "${GREEN}✓ Commit created and GPG-signed: $commit_sha${NC}"
    else
        echo -e "${YELLOW}⚠ Commit created but signature verification failed${NC}"
    fi
}

cmd_sync() {
  # Sync .plan/tickets/index.json with ticket .md files and git issues
  # Usage: ./scripts/worktree.sh sync [--fix] [--verbose]
  local fix_flag=""
  local verbose_flag=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fix)
        fix_flag="--fix"
        shift
        ;;
      --verbose)
        verbose_flag="--verbose"
        shift
        ;;
      *)
        shift
        ;;
    esac
  done

  if [[ ! -f "$REPO_ROOT/scripts/sync-ticket-index.ts" ]]; then
    echo -e "${RED}Error: sync-ticket-index.ts not found${NC}"
    exit 1
  fi

  echo -e "${CYAN}Syncing ticket index...${NC}"
  bun run "$REPO_ROOT/scripts/sync-ticket-index.ts" $fix_flag $verbose_flag
}

cmd_branches() {
  # List branches with status (merged/pending) and worktree markers
  # Usage: ./scripts/worktree.sh branches
  local current_branch
  current_branch=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "")

  echo -e "${CYAN}Branches:${NC}"
  echo ""

  # Get all local branches
  local branches
  branches=$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads/)

  # Get worktree branches
  local wt_branches
  wt_branches=$(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | \
    grep "^branch " | sed 's|^branch refs/heads/||')

  for branch in $branches; do
    # Check if branch is protected
    local is_protected="no"
    if is_protected "$branch"; then
      is_protected="yes"
    fi

    # Check if in worktree
    local wt_marker=""
    if echo "$wt_branches" | grep -q "^${branch}$"; then
      wt_marker=" [wt]"
    fi

    # Check if merged (merged into master)
    local status="pending"
    if git -C "$REPO_ROOT" merge-base --is-ancestor "$branch" master 2>/dev/null; then
      status="merged"
    elif git -C "$REPO_ROOT" merge-base --is-ancestor master "$branch" 2>/dev/null; then
      status="behind"
    fi

    # Check ahead/behind count
    local ahead behind
    ahead=$(git -C "$REPO_ROOT" rev-list --count master.."$branch" 2>/dev/null || echo "0")
    behind=$(git -C "$REPO_ROOT" rev-list --count "$branch"..master 2>/dev/null || echo "0")

    # Highlight current branch
    local prefix=""
    if [[ "$branch" == "$current_branch" ]]; then
      prefix="*"
    else
      prefix=" "
    fi

    # Format output
    if [[ "$status" == "merged" ]]; then
      echo -e "  ${prefix}${branch}${wt_marker} ${GREEN}(merged)${NC}"
    elif [[ "$status" == "behind" ]]; then
      echo -e "  ${prefix}${branch}${wt_marker} ${YELLOW}(behind by ${behind})${NC}"
    else
      echo -e "  ${prefix}${branch}${wt_marker} (ahead: ${ahead})"
    fi
  done
}

cmd_diff() {
  # Show diff between branch and master (ahead count, changed files)
  # Usage: ./scripts/worktree.sh diff <branch>
  local branch="$1"

  if [[ -z "$branch" ]]; then
    echo -e "${RED}Error: branch name required${NC}"
    echo "Usage: $(basename "$0") diff <branch>"
    exit 1
  fi

  # Resolve branch name
  local resolved
  resolved="$(resolve_branch "$branch")"
  if [[ -n "$resolved" ]] && [[ "$resolved" != "$branch" ]]; then
    branch="$resolved"
  fi

  # Check if branch exists
  if ! git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
    echo -e "${RED}Error: branch '$branch' not found${NC}"
    exit 1
  fi

  # Calculate ahead/behind
  local ahead behind
  ahead=$(git -C "$REPO_ROOT" rev-list --count master.."$branch" 2>/dev/null || echo "0")
  behind=$(git -C "$REPO_ROOT" rev-list --count "$branch"..master 2>/dev/null || echo "0")

  echo -e "${CYAN}Diff for '$branch':${NC}"
  echo ""

  if [[ "$ahead" -eq 0 ]] && [[ "$behind" -eq 0 ]]; then
    echo "  Branch is up to date with master"
    return 0
  fi

  if [[ "$ahead" -gt 0 ]]; then
    echo -e "  Ahead: ${GREEN}${ahead}${NC} commits"
    echo ""
    echo "  Changed files:"
    git -C "$REPO_ROOT" diff --name-only master.."$branch" 2>/dev/null | while read -r file; do
      echo -e "    ${CYAN}•${NC} $file"
    done
  fi

  if [[ "$behind" -gt 0 ]]; then
    echo ""
    echo -e "  Behind: ${RED}${behind}${NC} commits"
  fi

  echo ""
}

cmd_status() {
  # Show current branch status
  # Usage: ./scripts/worktree.sh status [branch]
  local branch="$1"

  if [[ -z "$branch" ]]; then
    branch=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "")
    if [[ -z "$branch" ]]; then
      echo -e "${RED}Error: not on a branch${NC}"
      exit 1
    fi
  fi

  echo -e "${CYAN}Branch status:${NC}"
  echo ""

  # Check if branch exists
  if ! git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
    echo -e "${RED}Error: branch '$branch' not found${NC}"
    exit 1
  fi

  # Show branch info
  echo "  Branch: $branch"
  local commit
  commit=$(git -C "$REPO_ROOT" rev-parse --short "$branch" 2>/dev/null)
  echo "  Commit: $commit"

  # Show ahead/behind
  local ahead behind
  ahead=$(git -C "$REPO_ROOT" rev-list --count master.."$branch" 2>/dev/null || echo "0")
  behind=$(git -C "$REPO_ROOT" rev-list --count "$branch"..master 2>/dev/null || echo "0")

  echo "  Ahead: $ahead"
  echo "  Behind: $behind"

  # Show if in worktree
  local worktree_path
  worktree_path="$(find_worktree "$branch")"
  if [[ -n "$worktree_path" ]]; then
    echo "  Worktree: $worktree_path"
  fi

  # Show last commit message
  local msg
  msg=$(git -C "$REPO_ROOT" log -1 --pretty=format:'%s' "$branch" 2>/dev/null)
  echo "  Last commit: $msg"
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
    commit)
        shift
        cmd_commit "${1:-}"
        ;;
    ticket)
        shift
        cmd_ticket "$@"
        ;;
    issues)
        shift
        cmd_issues "$@"
        ;;
    show)
        shift
        cmd_show "${1:-}"
        ;;
    comment)
        shift
        cmd_comment "$@"
        ;;
    edit)
        shift
        cmd_edit "$@"
        ;;
    state)
        shift
        cmd_state "${1:-}" "${2:-}"
        ;;
    search)
        shift
        cmd_search "${1:-}"
        ;;
    attach)
        shift
        cmd_attach "${1:-}" "${2:-}"
        ;;
    attach-dir)
        shift
        cmd_attach_dir "${1:-}" "${2:-}"
        ;;
    gi)
        shift
        cmd_gi "$@"
        ;;
    prs)
        cmd_prs
        ;;
    *)
        usage
        exit 1
        ;;
esac

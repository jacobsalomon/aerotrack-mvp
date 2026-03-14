#!/bin/bash
#
# Remote Control Server for AeroVision MVP
#
# Starts Claude Code in remote-control server mode with spawn options,
# allowing concurrent sessions from any device (phone, tablet, browser).
#
# Uses git worktrees by default so parallel sessions don't conflict.
#
# Usage:
#   ./scripts/remote-control.sh                    # Default: worktree mode, 32 capacity
#   ./scripts/remote-control.sh --spawn same-dir   # Shared directory mode
#   ./scripts/remote-control.sh --capacity 8       # Limit concurrent sessions
#   ./scripts/remote-control.sh --name "AeroVision" --sandbox
#   ./scripts/remote-control.sh --ralph            # Ralph loop mode via remote control
#

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Defaults
SPAWN_MODE="worktree"
CAPACITY=32
SESSION_NAME="AeroVision MVP"
SANDBOX=""
VERBOSE=""
RALPH_MODE=false
CLAUDE_CMD="${CLAUDE_CMD:-claude}"

show_help() {
    cat <<EOF
Remote Control Server for AeroVision MVP

Start Claude Code in remote-control server mode so you can connect from
any device — phone, tablet, or browser via claude.ai/code.

Usage:
  ./scripts/remote-control.sh [options]

Options:
  --spawn <mode>      How concurrent sessions are created (default: worktree)
                        same-dir  — all sessions share the working directory
                        worktree  — each session gets its own git worktree
  --capacity <N>      Max concurrent sessions (default: 32)
  --name <name>       Custom session title (default: "AeroVision MVP")
  --sandbox           Enable filesystem/network sandboxing
  --no-sandbox        Disable sandboxing (default)
  --verbose           Show detailed connection and session logs
  --ralph             Start in Ralph loop mode (auto-picks specs)
  -h, --help          Show this help

Examples:
  # Start with defaults (worktree isolation, 32 sessions max)
  ./scripts/remote-control.sh

  # Shared directory, limited concurrency
  ./scripts/remote-control.sh --spawn same-dir --capacity 4

  # Named session with sandboxing
  ./scripts/remote-control.sh --name "Parker Demo" --sandbox

  # Interactive session (not server mode)
  claude --remote-control "AeroVision MVP"

Spawn Modes:
  worktree (default)
    Each on-demand session gets its own git worktree. Sessions are fully
    isolated — no file conflicts. Requires a git repository. Press 'w'
    at runtime to toggle between modes.

  same-dir
    All sessions share the current working directory. Faster to start,
    but sessions can conflict if editing the same files. Good for
    read-only or single-user scenarios.

Connecting:
  Once started, the server displays a session URL and QR code.
  - Open the URL in any browser (claude.ai/code)
  - Scan the QR code with the Claude iOS/Android app
  - Or find the session by name in claude.ai/code
  Press spacebar to toggle the QR code display.

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --spawn)
            SPAWN_MODE="${2:-worktree}"
            if [[ "$SPAWN_MODE" != "same-dir" && "$SPAWN_MODE" != "worktree" ]]; then
                echo -e "${RED}Error: --spawn must be 'same-dir' or 'worktree'${NC}"
                exit 1
            fi
            shift 2
            ;;
        --capacity)
            CAPACITY="${2:-32}"
            if ! [[ "$CAPACITY" =~ ^[0-9]+$ ]] || [[ "$CAPACITY" -lt 1 ]]; then
                echo -e "${RED}Error: --capacity must be a positive integer${NC}"
                exit 1
            fi
            shift 2
            ;;
        --name)
            SESSION_NAME="${2:-AeroVision MVP}"
            shift 2
            ;;
        --sandbox)
            SANDBOX="--sandbox"
            shift
            ;;
        --no-sandbox)
            SANDBOX="--no-sandbox"
            shift
            ;;
        --verbose)
            VERBOSE="--verbose"
            shift
            ;;
        --ralph)
            RALPH_MODE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown argument: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

cd "$PROJECT_DIR"

# Verify we're in a git repo (required for worktree mode)
if [[ "$SPAWN_MODE" == "worktree" ]]; then
    if ! git rev-parse --is-inside-work-tree &>/dev/null; then
        echo -e "${RED}Error: worktree spawn mode requires a git repository${NC}"
        echo -e "${YELLOW}Use --spawn same-dir instead, or initialize git first.${NC}"
        exit 1
    fi
fi

# Check Claude CLI
if ! command -v "$CLAUDE_CMD" &>/dev/null; then
    echo -e "${RED}Error: Claude CLI not found${NC}"
    echo ""
    echo "Install Claude Code CLI (v2.1.51+) and authenticate first."
    echo "  https://claude.ai/code"
    echo ""
    echo "Then run: claude /login"
    exit 1
fi

# Version check (remote-control requires v2.1.51+)
CLAUDE_VERSION=$("$CLAUDE_CMD" --version 2>/dev/null || echo "unknown")

# Get current branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}          AEROVISION REMOTE CONTROL SERVER                    ${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Session:${NC}   $SESSION_NAME"
echo -e "${BLUE}Spawn:${NC}     $SPAWN_MODE"
echo -e "${BLUE}Capacity:${NC}  $CAPACITY concurrent sessions"
echo -e "${BLUE}Branch:${NC}   $CURRENT_BRANCH"
echo -e "${BLUE}Sandbox:${NC}  $([ -n "$SANDBOX" ] && echo "$SANDBOX" || echo "default (off)")"
echo -e "${BLUE}Verbose:${NC}  $([ -n "$VERBOSE" ] && echo "yes" || echo "no")"
echo -e "${BLUE}Claude:${NC}   $CLAUDE_VERSION"
echo ""
echo -e "${CYAN}Once started:${NC}"
echo -e "  ${CYAN}• Open the session URL in any browser${NC}"
echo -e "  ${CYAN}• Scan QR code with Claude mobile app${NC}"
echo -e "  ${CYAN}• Press spacebar to toggle QR code${NC}"
echo -e "  ${CYAN}• Press 'w' to toggle spawn mode${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
echo ""

# Build the command
CMD="$CLAUDE_CMD remote-control"
CMD="$CMD --name \"$SESSION_NAME\""
CMD="$CMD --spawn $SPAWN_MODE"
CMD="$CMD --capacity $CAPACITY"
[ -n "$SANDBOX" ] && CMD="$CMD $SANDBOX"
[ -n "$VERBOSE" ] && CMD="$CMD $VERBOSE"

echo -e "${PURPLE}Running: $CMD${NC}"
echo ""

# Execute
eval "$CMD"

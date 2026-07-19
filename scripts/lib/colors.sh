#!/usr/bin/env bash
# scripts/lib/colors.sh — Shared color definitions and utility functions
# Source this file: source "$(dirname "$0")/lib/colors.sh"

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Logging ─────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}$*${NC}"; }
success() { echo -e "${GREEN}$*${NC}"; }
warn()    { echo -e "${YELLOW}$*${NC}"; }
error()   { echo -e "${RED}$*${NC}"; }
bold()    { echo -e "${BOLD}$*${NC}"; }

# ── Status indicators ───────────────────────────────────────────────
dot_green()  { echo -e "${GREEN}●${NC}"; }
dot_yellow() { echo -e "${YELLOW}●${NC}"; }
dot_red()    { echo -e "${RED}●${NC}"; }
dot_cyan()   { echo -e "${CYAN}●${NC}"; }

#!/usr/bin/env bash
# Ralph loop for spec-ralph: one ticket per fresh, token-lean Claude Code session.
# Usage: .ralph/ralph.sh [max_iterations]    (default 30)
# Stop any time with Ctrl-C. Rerun to resume; state lives in the repo files.
#
# Token discipline (see .ralph/PROMPT.md):
#   - every iteration is a new, non-persistent session (nothing carries over),
#   - low reasoning effort by default,
#   - no plugins, MCP servers/apps, skills or Chrome: only project settings load,
#   - only the tools the loop uses are loaded (their definitions sit in every
#     request: all built-in tools cost ~44k tokens before any work, this set ~19k),
#   - usage is logged per iteration and flagged when the work passes the budget.
#
# "Work tokens" = how far the context grew past the fixed start (system prompt,
# tools, PROMPT.md) plus everything written. That is what PROMPT.md's budget means.
#
# Tunables (environment):
#   RALPH_EFFORT        low | medium | high           (default low)
#   RALPH_MODEL         model alias or id             (default: your CLI default)
#   RALPH_TOKEN_BUDGET  soft per-iteration work budget (default 25000)
#   RALPH_MAX_USD       hard per-iteration cap, --print only (default unset)
#   RALPH_DRY_RUN=1     print the claude command and exit

set -euo pipefail

MAX="${1:-30}"
STALL_LIMIT=3                 # stop after this many iterations with no new commit
PROMPT=".ralph/PROMPT.md"
SETTINGS=".ralph/settings.json"
LOGS=".ralph/logs"
EFFORT="${RALPH_EFFORT:-low}"
BUDGET="${RALPH_TOKEN_BUDGET:-25000}"

cd "$(git rev-parse --show-toplevel)"

args=(
  -p "$(cat "$PROMPT")"
  --no-session-persistence              # fresh session, never saved or resumed
  --effort "$EFFORT"
  --permission-mode acceptEdits
  --settings "$SETTINGS"
  --setting-sources project,local       # skip user settings, so user plugins stay off
  --strict-mcp-config --mcp-config '{"mcpServers":{}}'   # no MCP servers or apps
  --disable-slash-commands              # no skills in context
  --no-chrome
  --tools Bash,Read,Edit,Write,Glob,Grep,Agent,WebSearch,WebFetch   # Agent runs the answerer
  --output-format json                  # final result plus token usage
)
[[ -n "${RALPH_MODEL:-}" ]] && args+=(--model "$RALPH_MODEL")
[[ -n "${RALPH_MAX_USD:-}" ]] && args+=(--max-budget-usd "$RALPH_MAX_USD")

if [[ "${RALPH_DRY_RUN:-}" == "1" ]]; then
  printf 'claude'; printf ' %q' "${args[@]:2}"; printf ' -p <%s>\n' "$PROMPT"
  exit 0
fi

rm -f .ralph/done

branch="$(git branch --show-current)"
if [[ "$branch" != feature/* ]]; then
  echo "Refusing to run on '$branch'. Switch to a feature/ branch first." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree isn't clean. Commit or stash first." >&2
  exit 1
fi
for f in "$PROMPT" "$SETTINGS" .ralph/current-feature; do
  [[ -f "$f" ]] || { echo "Missing $f. Run the spec-ralph skill first." >&2; exit 1; }
done
command -v claude >/dev/null || { echo "Claude Code CLI ('claude') not found on PATH." >&2; exit 1; }
command -v node >/dev/null || { echo "node is needed to read token usage." >&2; exit 1; }

mkdir -p "$LOGS"
usage_csv="$LOGS/usage.csv"
[[ -f "$usage_csv" ]] || echo "iteration,log,start_context,end_context,output,work,turns,cost_usd" > "$usage_csv"
last_head="$(git rev-parse HEAD)"
stalls=0
run_total=0

# Prints: start_context end_context output work turns cost, then the result text.
read_usage() {
  node -e '
    const fs = require("fs");
    let d = {};
    try { d = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { console.log("0 0 0 0 0 0"); console.log("(no JSON result; see log)"); process.exit(0); }
    const ctx = (u) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    const u = d.usage || {};
    const calls = Array.isArray(u.iterations) && u.iterations.length > 0 ? u.iterations : [u];
    const start = ctx(calls[0]);
    const end = ctx(calls[calls.length - 1]);
    const out = calls.reduce((n, c) => n + (c.output_tokens || 0), 0) || u.output_tokens || 0;
    const work = Math.max(0, end - start) + out;
    console.log([start, end, out, work, d.num_turns || 0, (d.total_cost_usd || 0).toFixed(4)].join(" "));
    console.log(String(d.result || "").slice(0, 600));
  ' "$1"
}

for ((i = 1; i <= MAX; i++)); do
  log="$LOGS/$(date +%Y%m%d-%H%M%S)-iter-$(printf '%03d' "$i").json"
  echo "=== iteration $i/$MAX ($(date +%H:%M), effort $EFFORT) ==="

  claude "${args[@]}" > "$log" 2>&1 || true

  { read -r start end out work turns cost; result="$(cat)"; } < <(read_usage "$log")
  run_total=$((run_total + work))
  echo "$i,$log,$start,$end,$out,$work,$turns,$cost" >> "$usage_csv"
  echo "$result"
  echo "work tokens: $work (context $start -> $end, output $out), turns $turns, \$$cost; run total $run_total"
  if (( work > BUDGET )); then
    echo "WARNING: iteration $i used $work work tokens, over the $BUDGET budget. Split the ticket or tighten its Context." >&2
  fi

  if [[ -f .ralph/done ]]; then
    echo "Loop finished after $i iteration(s): $(head -n1 .ralph/done)"
    exit 0
  fi

  if [[ "$(git branch --show-current)" != "$branch" ]]; then
    echo "Branch changed during iteration $i. Stopping." >&2
    exit 1
  fi

  head_now="$(git rev-parse HEAD)"
  if [[ "$head_now" == "$last_head" ]]; then
    stalls=$((stalls + 1))
    echo "No new commit this iteration ($stalls/$STALL_LIMIT)."
    if (( stalls >= STALL_LIMIT )); then
      echo "Stalled: $STALL_LIMIT iterations without a commit. Check the latest log in $LOGS." >&2
      exit 3
    fi
  else
    stalls=0
    last_head="$head_now"
  fi
done

echo "Reached the $MAX-iteration cap. Check .ralph/progress.md, then rerun to continue." >&2
exit 2

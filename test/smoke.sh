#!/usr/bin/env bash
# Task Log — API Error Path & Regression Test Suite
# Run: ./test/smoke.sh [BASE_URL]
# Default: http://localhost:3001

BASE="${1:-http://localhost:3001}"
PASS=0
FAIL=0
TOTAL=0

green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
nc='\033[0m'

pass() { echo -e "${green}PASS${nc} $1"; PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); }
fail() { echo -e "${red}FAIL${nc} $1 — $2"; FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); }

check_status() {
  local name="$1" url="$2" expected="$3"
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$got" = "$expected" ]; then pass "$name [$got]"
  else fail "$name" "expected $expected, got $got"; fi
}

check_body() {
  local name="$1" url="$2" pattern="$3"
  local body
  body=$(curl -s "$url")
  if echo "$body" | grep -q "$pattern"; then pass "$name"
  else fail "$name" "pattern '$pattern' not found"; fi
}

check_json_field() {
  local name="$1" url="$2" field="$3"
  local body
  body=$(curl -s "$url")
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in (d if isinstance(d,dict) else d[0])" 2>/dev/null; then
    pass "$name"
  else
    fail "$name" "field '$field' missing from response"
  fi
}

echo ""
echo "=== Task Log Test Suite ==="
echo "Target: $BASE"
echo ""

# ── Happy path — GET endpoints ───────────────────────────────────────────────
echo "--- Happy path ---"
check_status "GET / homepage" "$BASE/" 200
check_status "GET /api/config" "$BASE/api/config" 200
check_status "GET /api/tasks" "$BASE/api/tasks" 200
check_status "GET /api/agents" "$BASE/api/agents" 200
check_status "GET /api/rooms" "$BASE/api/rooms" 200
check_status "GET /api/eng-tasks" "$BASE/api/eng-tasks" 200
check_status "GET /app.js" "$BASE/app.js" 200
check_status "GET /style.css" "$BASE/style.css" 200
check_status "GET /api/events (SSE)" "$BASE/api/events" 200

# ── Content validation ───────────────────────────────────────────────────────
echo ""
echo "--- Content validation ---"
check_body "Config returns token field" "$BASE/api/config" '"token"'
check_body "Tasks returns JSON array" "$BASE/api/tasks" '\['
check_body "Agents have id field" "$BASE/api/agents" '"id"'
check_body "Rooms have title field" "$BASE/api/rooms" '"title"'
check_body "Eng-tasks have priority field" "$BASE/api/eng-tasks" '"priority"'
check_body "Homepage has TASK LOG" "$BASE/" "TASK LOG"

# ── Error path — 404s ────────────────────────────────────────────────────────
echo ""
echo "--- Error paths ---"
check_status "GET /api/tasks/999999 (not found)" "$BASE/api/tasks/999999" 404
check_status "GET /api/agents/999999 (not found)" "$BASE/api/agents/999999" 404
check_status "GET /api/rooms/999999 (not found)" "$BASE/api/rooms/999999" 404
check_status "GET /api/eng-tasks/999999 (not found)" "$BASE/api/eng-tasks/999999" 404
check_status "GET /api/doesnotexist (unknown route)" "$BASE/api/doesnotexist" 404

# ── Error path — bad POST payloads ──────────────────────────────────────────
echo ""
echo "--- Bad payload rejection ---"
BAD_TASK=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/tasks" \
  -H "Content-Type: application/json" -d '{}')
if [ "$BAD_TASK" = "400" ]; then pass "POST /api/tasks without title → 400"
else fail "POST /api/tasks without title" "expected 400, got $BAD_TASK"; fi

BAD_AGENT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/agents" \
  -H "Content-Type: application/json" -d '{"name":"TestAgent"}')
if [ "$BAD_AGENT" = "400" ]; then pass "POST /api/agents without designation → 400"
else fail "POST /api/agents without designation" "expected 400, got $BAD_AGENT"; fi

BAD_ROOM=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/rooms" \
  -H "Content-Type: application/json" -d '{}')
if [ "$BAD_ROOM" = "400" ]; then pass "POST /api/rooms without title → 400"
else fail "POST /api/rooms without title" "expected 400, got $BAD_ROOM"; fi

BAD_MSG=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/messages" \
  -H "Content-Type: application/json" -d '{"content":"hello"}')
if [ "$BAD_MSG" = "400" ]; then pass "POST /api/messages without agent_name → 400"
else fail "POST /api/messages without agent_name" "expected 400, got $BAD_MSG"; fi

BAD_ENGTASK=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/eng-tasks" \
  -H "Content-Type: application/json" -d '{}')
if [ "$BAD_ENGTASK" = "400" ]; then pass "POST /api/eng-tasks without title → 400"
else fail "POST /api/eng-tasks without title" "expected 400, got $BAD_ENGTASK"; fi

# ── Error path — invalid enum values ────────────────────────────────────────
echo ""
echo "--- Invalid enum rejection ---"
INV_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/tasks/1" \
  -H "Content-Type: application/json" -d '{"status":"invalid_status"}')
if [ "$INV_STATUS" = "400" ] || [ "$INV_STATUS" = "404" ]; then pass "PUT /api/tasks/:id invalid status → 400/404"
else fail "PUT /api/tasks/:id invalid status" "expected 400 or 404, got $INV_STATUS"; fi

INV_MODEL=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/agents/1/model" \
  -H "Content-Type: application/json" -d '{"model":"gpt-4"}')
if [ "$INV_MODEL" = "400" ]; then pass "PUT /api/agents/:id/model invalid model → 400"
else fail "PUT /api/agents/:id/model invalid model" "expected 400, got $INV_MODEL"; fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "================================"
echo "Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  echo -e "${red}$FAIL tests FAILED${nc}"
  exit 1
else
  echo -e "${green}All tests passed${nc}"
fi

#!/usr/bin/env bash
# 로컬 시험: 새 데이터베이스(pq4r_test)를 만들고 서버를 띄운 뒤 시험을 돌린다.
# 필요: 로컬 Postgres(PGPORT), node. 사용: bash tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGHOST=${PGHOST:-localhost}; PGPORT=${PGPORT:-54329}; PGUSER=${PGUSER:-postgres}
DB=${TEST_DB:-pq4r_test}
psql -h $PGHOST -p $PGPORT -U $PGUSER -q -c "drop database if exists $DB with (force);" -c "create database $DB;"
psql -h $PGHOST -p $PGPORT -U $PGUSER -d $DB -q -v ON_ERROR_STOP=1 -f db/schema.sql >/dev/null 2>&1
export DATABASE_URL="postgres://$PGUSER@$PGHOST:$PGPORT/$DB"
export APP_SECRET=test-secret-0123456789abcdef TEACHER_PASSWORD=teacher-pass-1234 RESEARCHER_PASSWORD=research-pass-1234 CRON_SECRET=cron-secret-test
PORT=3200 node dev/server.js > /tmp/pq4r-test-server.log 2>&1 & SP=$!
trap 'kill $SP 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -s localhost:3200/api/v1/health >/dev/null && break; sleep 0.2; done
echo "== 엔진";  node tests/engine.test.js lib | tail -1
echo "== API";   TEST_BASE=http://localhost:3200 node tests/api.test.js
ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://localhost:3301 PORT=3202 node dev/server.js > /tmp/pq4r-test-server-ai.log 2>&1 & SP2=$!
trap 'kill $SP $SP2 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -s localhost:3202/api/v1/health >/dev/null && break; sleep 0.2; done
echo "== AI 경로(가짜 API)"; TEST_BASE_AI=http://localhost:3202 MOCK_PORT=3301 node tests/ai.test.js
if command -v python3 >/dev/null && python3 -c "import playwright" 2>/dev/null; then
  echo "== 브라우저 전체 흐름"; BASE=http://localhost:3200 AXE=${AXE:-} python3 tests/e2e.py | tail -60
fi

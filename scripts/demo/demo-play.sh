#!/usr/bin/env bash
# 데모 시나리오 플레이어 — /do 오더가 설계→구현→리뷰→배포→검증→해결을 거쳐
# 데이터 분석(명세→수집→판정)까지 가는 과정을, 격리된 .demo-meta 에 "진짜 메타 파일"로 재생한다.
#
# 메타는 손으로 짓지 않고 go-dobby 의 dobby-lib.sh 헬퍼(실제 /do 가 쓰는 것)로 쓴다.
# → 대시보드·에이전트 오피스가 실데이터와 똑같은 경로로 렌더한다.
#
# 쓰임:  bash scripts/demo/demo-play.sh {start|next|reset|status|auto [초]|clean}
#   start  : reset 후 1단계 진행
#   next   : 다음 단계 진행 (발표용 기본)
#   reset  : .demo-meta 를 지우고 다시 심음 (0단계, 시작 전)
#   status : 현재 단계 JSON 출력
#   auto   : 끝까지 자동 진행 (기본 8초 간격)
#   clean  : .demo-meta 삭제
set -euo pipefail

HERE="$(cd "$(dirname "$0")/../.." && pwd)"           # mentis-dashboard-v2 루트
ROOT="${DEMO_META:-$HERE/.demo-meta}"
STATE="$ROOT/.demo-state.json"
MARKER="$ROOT/.demo"
KEY="FE1-4242"
TITLE="오픈예정 알림 신청 버튼이 간헐적으로 먹통이 되는 문제"
DEV_SLUG="noti-dev"
TOTAL=12

# ── 안전 가드: 데모 폴더가 확실할 때만 지운다 ──────────────────────────
guard() {
  case "$ROOT" in
    */.demo-meta) : ;;
    *) echo "거부: 대상($ROOT)이 .demo-meta 가 아닙니다" >&2; exit 1 ;;
  esac
  if [ -d "$ROOT" ] && [ ! -f "$MARKER" ] && [ -n "$(ls -A "$ROOT" 2>/dev/null)" ]; then
    # seed-demo 가 심은 직후(마커 전)일 수 있다 — 데모 fixture 흔적이 있으면 통과
    [ -d "$ROOT/FE1-1187" ] || { echo "거부: $ROOT 에 .demo 마커가 없습니다 (실데이터일 수 있음)" >&2; exit 1; }
  fi
}

# ── dobby-lib 로드 (오피스 judge 와 같은 해석: GO_DOBBY_LIB → 플러그인 캐시 최신판) ──
find_lib() {
  if [ -n "${GO_DOBBY_LIB:-}" ] && [ -f "$GO_DOBBY_LIB" ]; then printf '%s' "$GO_DOBBY_LIB"; return; fi
  local base="$HOME/.claude/plugins/cache/mentis-plugins/go-dobby" v
  v="$(ls "$base" 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
  [ -n "$v" ] && [ -f "$base/$v/reference/dobby-lib.sh" ] && printf '%s' "$base/$v/reference/dobby-lib.sh"
}

load_lib() {
  local lib; lib="$(find_lib)"
  [ -n "$lib" ] || { echo "거부: dobby-lib.sh 를 찾지 못했습니다 (go-dobby 플러그인 필요)" >&2; exit 1; }
  # shellcheck disable=SC1090
  source "$HOME/.config/go-dobby/config.env" 2>/dev/null || true
  source "$lib" >/dev/null 2>&1 || true
  dobby_load_config >/dev/null 2>&1 || true
  export ORCHESTRATION_META="$ROOT"
  export ORCHESTRATION_META_PATH="$ROOT"
}

now() { date '+%Y-%m-%d %H:%M'; }
sid() { uuidgen | tr 'A-Z' 'a-z'; }
day() { # day -7 → 7일 전, day 0 → 오늘 (macOS date -v)
  case "$1" in
    0 | -0) date '+%Y-%m-%d' ;;
    *) date -v"$1"d '+%Y-%m-%d' ;;
  esac
}

state_write() { # step label
  printf '{ "step": %s, "total": %s, "label": "%s", "key": "%s", "at": "%s" }\n' \
    "$1" "$TOTAL" "$2" "$KEY" "$(now)" > "$STATE"
}
state_step() { [ -f "$STATE" ] && sed -n 's/.*"step": *\([0-9]*\).*/\1/p' "$STATE" || echo "-1"; }

# 세션 기록 한 줄(지난 세션 표·## 세션). cwd 는 데모 작업 폴더. 만든 세션 아이디는 LAST_SID 에 남는다.
LAST_SID=""
log_session() { # slug sub 단계이름
  LAST_SID="$(sid)"
  CLAUDE_CODE_SESSION_ID="$LAST_SID" dobby_session_log "$KEY" "$1" "$2" "$3" "$ROOT/.workspace/$KEY" >/dev/null 2>&1 || true
}

# 지금 작업중인 담당자를 "살아 있는 세션"으로 표시한다(.presence). 대시보드·오피스는
# 상태표의 작업중 행에 살아 있는 세션이 없으면 "세션 끊김" 모순으로 경고하기 때문에,
# 데모 전용 하트비트 프로세스(sleep, 스크립트가 끝나도 살아 있음)를 띄워 그 PID 를 적는다.
# 인자 없이 부르면 표시와 하트비트를 걷는다(사람 차례·해결처럼 아무도 일하지 않는 단계).
PRESENCE_FILE="" # ROOT 확정 뒤 presence()에서 계산
presence_kill() { # 이전 하트비트 정리(파일에 적힌 pid 가 sleep 일 때만 죽인다)
  local f="$ROOT/.presence/demo-live.json" old
  old="$(sed -n 's/.*"pid": \([0-9]*\).*/\1/p' "$f" 2>/dev/null || true)"
  if [ -n "$old" ] && [ "$(ps -o comm= -p "$old" 2>/dev/null)" = "sleep" ]; then kill "$old" 2>/dev/null || true; fi
  rm -f "$f"
}
presence() { # [slug]
  mkdir -p "$ROOT/.presence"
  presence_kill
  [ -n "${1:-}" ] || return 0
  nohup sleep 14400 >/dev/null 2>&1 &
  local hb=$!
  printf '{ "session": "%s", "pid": %s, "keys": ["%s"], "state": "working", "slug": "%s", "demo": true }\n' \
    "${LAST_SID:-demo}" "$hb" "$KEY" "$1" > "$ROOT/.presence/demo-live.json"
}

# ── 리셋: 배경 fixture + 데모 오더 0단계 ───────────────────────────────
do_reset() {
  guard
  presence_kill 2>/dev/null || true # 하트비트 먼저 걷고 폴더를 지운다
  DEMO_META="$ROOT" node "$HERE/scripts/seed-demo.mjs" >/dev/null
  touch "$MARKER"
  mkdir -p "$ROOT/.workspace/$KEY"
  state_write 0 "시작 전"
  echo "리셋 완료 — 0/$TOTAL (시작 전)"
}

# ── 1막: /do 오더 ─────────────────────────────────────────────────────
step_1() { # 설계
  dobby_scaffold_meta "$KEY" "$TITLE"
  # /do(v2) 표지: 단계 규칙 줄
  grep -q '단계 규칙' "$ROOT/$KEY/status.md" || \
    sed -i '' 's/^- \*\*단계\*\*: 착수/- **단계**: 착수\n- **단계 규칙**: 다섯 담당자/' "$ROOT/$KEY/status.md"
  dobby_ensure_board "$KEY"
  dobby_agent_add "$KEY" analysis-agent 기획자 "설계" 대기 0
  dobby_agent_add "$KEY" "$DEV_SLUG" 개발자 "구현" 대기 0
  dobby_agent_add "$KEY" review-agent 리뷰어 "코드 리뷰" 대기 0
  dobby_agent_add "$KEY" deploy-agent 배포담당 "통합과 배포" 대기 0
  dobby_agent_add "$KEY" test-agent 테스터 "검증" 대기 0
  dobby_phase "$KEY" 설계
  log_session analysis-agent design 설계
  dobby_agent_state "$KEY" analysis-agent 작업중 0 "지금 코드를 읽고 설계 문서 작성 중"
  dobby_event "$KEY" "설계 시작 — 알림 신청 버튼 코드 경로 분석"
  cat > "$ROOT/$KEY/design.md" <<'EOF'
# FE1-4242 설계

## 한 장 요약
오픈예정 프로젝트의 "알림 신청" 버튼이 빠르게 두 번 누르면 요청이 겹쳐 두 번째 응답이
첫 번째를 덮어쓰고, 화면이 "신청 전" 상태로 되돌아간다. 요청 중에는 버튼을 잠그고,
응답은 마지막 요청만 반영하도록 고친다.

(작성 중…)
EOF
  presence analysis-agent
}

step_2() { # 설계확인 (사람 차례 ❓)
  cat > "$ROOT/$KEY/design.md" <<'EOF'
# FE1-4242 설계

## 한 장 요약
오픈예정 프로젝트의 "알림 신청" 버튼이 빠르게 두 번 누르면 요청이 겹쳐 두 번째 응답이
첫 번째를 덮어쓰고, 화면이 "신청 전" 상태로 되돌아간다. 요청 중에는 버튼을 잠그고,
응답은 마지막 요청만 반영하도록 고친다.

## 관련 파일
- src/components/openplan/NotifyButton.tsx — 버튼과 신청 요청
- src/hooks/useNotifyState.ts — 신청 상태 보관

## 현재 동작
버튼을 누를 때마다 `requestNotify()` 를 바로 보낸다. 요청 중 잠금이 없어
연타하면 요청 두 개가 나가고, 네트워크 순서에 따라 늦게 온 응답이 상태를 덮어쓴다.

## 문제가 되는 코드와 원인
### src/components/openplan/NotifyButton.tsx
- 지금: `onClick={() => requestNotify(projectId)}` — 잠금 없음
- 원인: 중복 요청 + 응답 역전

## 고칠 코드
### src/components/openplan/NotifyButton.tsx
- 지금: 클릭마다 요청 전송
- 고친 뒤: 요청 중 `disabled` + 진행 스피너, 완료/실패 시 해제
- 왜: 중복 요청 차단

### src/hooks/useNotifyState.ts
- 지금: 응답 순서 그대로 반영
- 고친 뒤: 요청 일련번호를 두고 마지막 요청의 응답만 반영
- 왜: 응답 역전 방지

## 결정과 근거
- 디바운스가 아니라 잠금을 쓴다 — 신청은 한 번이면 되는 동작이라 잠금이 단순하다.

## 닫히는 조건
- C1 연타해도 신청이 한 번만 간다
- C2 신청 후 새로고침 없이 "신청됨" 상태가 유지된다

## 리뷰 항목
- 잠금 해제 누락(에러 경로) 여부
- 일련번호 비교 로직의 경계값

## 확인이 필요했던 것
- 실패 시 버튼 문구: "다시 시도"로 통일 (기획 답 필요 없음, UX 관례 따름)
EOF
  cat > "$ROOT/$KEY/test-plan.md" <<'EOF'
# FE1-4242 테스트 계획

| # | 조건 | 시나리오 | 기대 |
|---|------|----------|------|
| 1 | C1 | 알림 신청 버튼 연타(5회) | 요청 1건, "신청됨" 표시 |
| 2 | C1 | 요청 중 버튼 상태 | 비활성 + 스피너 |
| 3 | C2 | 신청 후 목록 재진입 | "신청됨" 유지 |
| 4 | - | 실패 응답(네트워크 차단) | "다시 시도" 노출, 잠금 해제 |
EOF
  dobby_phase "$KEY" 설계확인
  dobby_agent_state "$KEY" analysis-agent "사람 차례" 0 "설계 요약 확인 받기" "/do $KEY 답 \"자동 실행\""
  dobby_event "$KEY" "설계 완료 — 사람 확인 차례 (요약을 보고 자동 실행 여부 답하기)"
  presence
}

step_3() { # 구현
  dobby_event "$KEY" "사람이 자동 실행으로 확정 — 구현 시작"
  dobby_phase "$KEY" 구현
  dobby_agent_state "$KEY" analysis-agent 완료 0 "설계 확정"
  log_session "$DEV_SLUG" impl 구현
  dobby_agent_state "$KEY" "$DEV_SLUG" 작업중 0 "설계 문서대로 구현 중"
  cat > "$ROOT/$KEY/implementation.md" <<'EOF'
# FE1-4242 구현 기록

## 건드린 파일
- src/components/openplan/NotifyButton.tsx — 요청 중 disabled + 스피너
- src/hooks/useNotifyState.ts — 요청 일련번호로 마지막 응답만 반영

(구현 진행 중…)
EOF
  presence noti-dev
}

step_4() { # 리뷰 1차 — 지적
  dobby_agent_state "$KEY" "$DEV_SLUG" 완료 0 "구현 완료 — 리뷰 대기"
  cat > "$ROOT/$KEY/implementation.md" <<'EOF'
# FE1-4242 구현 기록

## 건드린 파일
- src/components/openplan/NotifyButton.tsx — 요청 중 disabled + 스피너
- src/hooks/useNotifyState.ts — 요청 일련번호(seq)로 마지막 응답만 반영

## 핵심 설계 결정
- 잠금은 버튼 컴포넌트, 역전 방지는 훅 — 역할을 한 곳씩만 맡긴다.

## 커밋·브랜치
- fix: FE1-4242 알림 신청 중복 요청·응답 역전 수정 (b7e2f1a)
- 브랜치: bugfix/FE1-4242
EOF
  dobby_phase "$KEY" 리뷰
  log_session review-agent round-1 "1차 리뷰"
  dobby_agent_state "$KEY" review-agent 작업중 1 "1차 리뷰 — 설계 리뷰 항목 대조 중"
  mkdir -p "$ROOT/$KEY/reviews/round-1"
  cat > "$ROOT/$KEY/reviews/round-1/review-agent.md" <<'EOF'
# FE1-4242 1차 리뷰

- [major] src/components/openplan/NotifyButton.tsx:58 — 요청 실패(reject) 경로에서
  잠금 해제가 빠졌다. 네트워크 오류가 나면 버튼이 영영 비활성으로 남는다.
  finally 에서 해제해야 한다.
- [nit] useNotifyState.ts:21 — seq 비교에 주석 한 줄(왜 >= 가 아니라 > 인지).

막는 지적: 1건
EOF
  dobby_event "$KEY" "1차 리뷰 — [major] 1건 (실패 경로 잠금 해제 누락)"
  presence review-agent
}

step_5() { # 수정 1차
  dobby_phase "$KEY" 수정
  dobby_agent_state "$KEY" review-agent 완료 1 "1차 리뷰 — 막는 지적 1건"
  log_session "$DEV_SLUG" fix-1 "1차 수정"
  dobby_agent_state "$KEY" "$DEV_SLUG" 작업중 1 "1차 수정 — 실패 경로 잠금 해제 반영 중"
  cat >> "$ROOT/$KEY/implementation.md" <<'EOF'

## 1차 수정 (리뷰 반영)
- NotifyButton.tsx — 요청을 try/finally 로 감싸 실패해도 잠금 해제
- useNotifyState.ts — seq 비교 이유 주석 추가
- 커밋: fix: FE1-4242 실패 경로 잠금 해제 (c9d3a2b)
EOF
  presence noti-dev
}

step_6() { # 리뷰 2차 통과 → 통합
  mkdir -p "$ROOT/$KEY/reviews/round-2"
  cat > "$ROOT/$KEY/reviews/round-2/review-agent.md" <<'EOF'
# FE1-4242 2차 리뷰

1차 지적(실패 경로 잠금 해제) 반영 확인. 추가 지적 없음.

막는 지적: 0건 — 통과
EOF
  dobby_agent_state "$KEY" review-agent 완료 2 "2차 리뷰 — 통과"
  dobby_agent_state "$KEY" "$DEV_SLUG" 완료 1 "구현·수정 완료"
  dobby_phase "$KEY" 통합
  log_session deploy-agent integrate 통합
  dobby_agent_state "$KEY" deploy-agent 작업중 0 "통합 — 작업 브랜치 커밋·푸시"
  dobby_event "$KEY" "2차 리뷰 통과 — 통합(커밋·푸시) 시작"
  presence deploy-agent
}

step_7() { # 배포 (PR → 머지 → 빌드 대기)
  dobby_event "$KEY" "통합 완료 — dev 배포 시작"
  dobby_phase "$KEY" 배포
  log_session deploy-agent "ship-$(date '+%Y%m%d-%H%M%S')" 배포
  dobby_ship_stage "$KEY" wadiz-frontend dev "PR 생성" 5178 >/dev/null 2>&1 || true
  dobby_ship_stage "$KEY" wadiz-frontend dev "머지" 5178 >/dev/null 2>&1 || true
  dobby_ship_stage "$KEY" wadiz-frontend dev "빌드 대기" 5178 >/dev/null 2>&1 || true
  presence deploy-agent
}

step_8() { # 배포 확인 → 검증 시작
  dobby_ship_stage "$KEY" wadiz-frontend dev "배포 확인" 5178 >/dev/null 2>&1 || true
  dobby_phase "$KEY" 검증
  log_session test-agent verify-V1 "검증 V1"
  TESTDIR="$(dobby_testrun_new "$KEY" 4 dev 2>/dev/null | tail -1)"
  dobby_agent_state "$KEY" test-agent 작업중 1 "1회차 검증 — dev 환경 브라우저 시험 중"
  dobby_event "$KEY" "dev 배포 확인 — 검증 1회차 시작 (시나리오 4건)"
  presence test-agent
}

step_9() { # 검증 통과 → 해결
  local dir ts
  dir="$(find "$ROOT/$KEY/test-runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -1)"
  ts="$(basename "$dir")"
  cat > "$dir/result.md" <<'EOF'
# FE1-4242 테스트 결과 — 회차 1

- **환경**: dev

검증 완료 — 4건 모두 통과.

## 시나리오별 결과

<!-- dobby:scenarios -->
| # | 조건 | 페이지 / URL | 확인 항목 | 기대 | 실제 | 판정 | 근거 |
|---|------|--------------|-----------|------|------|------|------|
| 1 | C1 | 오픈예정 상세 | 알림 신청 버튼 연타(5회) | 요청 1건 | 요청 1건 | PASS | 네트워크 로그 |
| 2 | C1 | 오픈예정 상세 | 요청 중 버튼 상태 | 비활성+스피너 | 비활성+스피너 | PASS | 화면 캡처 |
| 3 | C2 | 오픈예정 목록 | 재진입 후 상태 | 신청됨 유지 | 신청됨 유지 | PASS | 화면 캡처 |
| 4 | - | 오픈예정 상세 | 실패 응답 처리 | 다시 시도 노출 | 다시 시도 노출 | PASS | 오프라인 모드 |
EOF
  dobby_testrun_update "$KEY" "$ts" 완료 "4/0/0" >/dev/null 2>&1 || true
  dobby_phase "$KEY" 해결
  cat >> "$ROOT/$KEY/status.md" <<EOF

## 해결
- **처리 일시**: $(now)
- **근거**: 2차 리뷰 통과(막는 지적 0건) · 검증 1회차 4/0/0 · dev 배포 확인
EOF
  dobby_agent_state "$KEY" deploy-agent 완료 0 "dev 배포 확인"
  dobby_event "$KEY" "검증 1회차 통과(4/0/0) — 해결 처리"
  dobby_agent_state "$KEY" test-agent 완료 1 "1회차 통과 (4/0/0)"
  presence
}

# ── 2막: 데이터 분석 (해결 "일주일 뒤" 연출 — 배포일을 7일 전으로 적는다) ──
step_10() { # 측정 명세
  mkdir -p "$ROOT/$KEY/data"
  cat > "$ROOT/$KEY/data/spec.json" <<EOF
{
  "kind": "conversion",
  "title": "오픈예정 알림 신청 완료율",
  "liveDate": "$(day -7)",
  "liveDateSource": "배포 표(dev→live)",
  "startAt": "$(day -7) 00:00:00",
  "reason": "버튼 먹통 수정이 실제 신청 완료율을 올렸는지 확인",
  "notes": "기준 지표: 버튼 클릭 대비 신청 완료. 수정 전 7일과 비교.",
  "events": [
    { "name": "openplan_notify_click", "category": "오픈예정", "action": "알림신청 클릭", "meaning": "버튼 클릭(시도)" },
    { "name": "openplan_notify_done", "category": "오픈예정", "action": "알림신청 완료", "meaning": "신청 성공(완료)" }
  ],
  "daily": ["openplan_notify_click", "openplan_notify_done"],
  "metric": { "name": "알림 신청 완료율", "direction": "up" }
}
EOF
  presence
}

# summary.json 생성 공용부. $1=커버일수(3|7)
write_summary() {
  local days="$1" verdict headline_p headline_rate target_n target_v
  local run_id covered
  run_id="$(date '+%Y%m%d')-r$([ "$days" = 3 ] && echo 1 || echo 2)"
  covered="$(day -$((7 - days)))"
  if [ "$days" = 3 ]; then
    verdict="판단 이르다"; headline_rate=0.081; headline_p=0.21; target_n=412; target_v=0.712
  else
    verdict="성과 있음"; headline_rate=0.124; headline_p=0.003; target_n=1038; target_v=0.767
  fi
  # 일별 추이
  local rows="" d i clicks dones
  for ((i = 0; i < days; i++)); do
    d="$(day -$((7 - 1 - i)))"
    clicks=$((300 + i * 22 + (i % 3) * 9))
    dones=$((clicks * (69 + i) / 100))
    rows+="$(printf '{ "date": "%s", "values": { "openplan_notify_click": %s, "openplan_notify_done": %s } }' "$d" "$clicks" "$dones"),"
  done
  rows="${rows%,}"
  cat > "$ROOT/$KEY/data/summary.json" <<EOF
{
  "key": "$KEY",
  "kind": "conversion",
  "title": "오픈예정 알림 신청 완료율",
  "liveDate": "$(day -7)",
  "startAt": "$(day -7) 00:00:00",
  "coveredUntil": "$covered 23:59:59",
  "runs": $([ "$days" = 3 ] && echo 1 || echo 2),
  "lastRunId": "$run_id",
  "verdict": "$verdict",
  "headline": {
    "metric": "알림 신청 완료율",
    "target": { "label": "수정 후", "n": $target_n, "value": $target_v },
    "compare": { "label": "수정 전 7일", "n": 1904, "value": 0.682 },
    "changeRate": $headline_rate,
    "p": $headline_p,
    "requiredN": 980
  },
  "segments": [
    { "name": "모바일 웹", "target": { "label": "수정 후", "n": $((target_n * 7 / 10)), "value": 0.781 }, "compare": { "label": "수정 전", "n": 1330, "value": 0.671 }, "changeRate": 0.164, "p": $([ "$days" = 3 ] && echo 0.18 || echo 0.002), "badge": "$([ "$days" = 3 ] && echo "판단 이르다" || echo "성과 있음")", "requiredN": 690 },
    { "name": "PC 웹", "target": { "label": "수정 후", "n": $((target_n * 3 / 10)), "value": 0.734 }, "compare": { "label": "수정 전", "n": 574, "value": 0.718 }, "changeRate": 0.022, "p": 0.61, "badge": "차이 없음", "requiredN": 290 }
  ],
  "daily": {
    "series": ["openplan_notify_click", "openplan_notify_done"],
    "rows": [$rows]
  },
  "tables": {
    "funnel": [
      { "grp": null, "step": 1, "name": "버튼 클릭", "devices": $((target_n + 310)) },
      { "grp": null, "step": 2, "name": "신청 완료", "devices": $target_n }
    ],
    "continuations": [
      { "grp": null, "name": "클릭→완료", "fromDevices": $((target_n + 310)), "toDevices": $target_n, "rate": $target_v }
    ],
    "groups": []
  },
  "history": [
    { "runId": "$(date '+%Y%m%d')-r1", "coveredUntil": "$(day -4) 23:59:59", "changeRate": 0.081, "p": 0.21, "verdict": "판단 이르다" }$([ "$days" = 7 ] && printf ',\n    { "runId": "%s", "coveredUntil": "%s 23:59:59", "changeRate": 0.124, "p": 0.003, "verdict": "성과 있음" }' "$run_id" "$covered")
  ],
  "oneLine": "$([ "$days" = 3 ] && echo "완료율이 오르는 추세지만 표본이 모자라 아직 판단하기 이르다 (필요 980, 현재 412)" || echo "알림 신청 완료율이 68.2% → 76.7%로 올랐다 (+12.4%, 우연일 확률 0.3%)")",
  "health": { "zeroDays": [], "srmP": null, "fingerprint": "demo", "anomalyCandidates": 0 }
}
EOF
}

step_11() { # 수집 1회차 — 판단 이르다
  local rid="$(date '+%Y%m%d')-r1"
  mkdir -p "$ROOT/$KEY/data/runs/$rid"
  printf '{ "from": "%s 00:00:00", "to": "%s 23:59:59", "reset": false }\n' "$(day -7)" "$(day -4)" \
    > "$ROOT/$KEY/data/runs/$rid/window.json"
  printf '{ "rows": 3, "demo": true }\n' > "$ROOT/$KEY/data/runs/$rid/stats.json"
  write_summary 3
}

step_12() { # 수집 2회차 — 성과 있음 + 리포트
  local rid="$(date '+%Y%m%d')-r2"
  mkdir -p "$ROOT/$KEY/data/runs/$rid"
  printf '{ "from": "%s 00:00:00", "to": "%s 23:59:59", "reset": false }\n' "$(day -4)" "$(day 0)" \
    > "$ROOT/$KEY/data/runs/$rid/window.json"
  printf '{ "rows": 7, "demo": true }\n' > "$ROOT/$KEY/data/runs/$rid/stats.json"
  write_summary 7
  cat > "$ROOT/$KEY/data/report.md" <<EOF
# FE1-4242 데이터 해석 — 오픈예정 알림 신청 완료율

## 결론
**이 수정은 목적을 달성했습니다.** 알림 신청 버튼을 누른 사람 가운데 실제로 신청이
완료된 비율이 **68.2% → 76.7%** 로 올랐습니다. 올랐을 확률이 우연이라고 보기에는
너무 낮아(1,000번 중 3번 꼴) 수정의 효과로 봐도 됩니다.

## 근거
- 수정 전 7일: 1,904명 중 68.2% 완료
- 수정 후 7일: 1,038명 중 76.7% 완료 (+12.4%)
- 모바일 웹에서 효과가 컸고(+16.4%), PC 웹은 원래 문제가 드물어 차이가 없습니다.

## 자세히
첫 3일 치만 모였을 때는 오르는 추세였지만 표본이 모자라 "판단 이르다"로 보류했습니다
(필요 980명, 당시 412명). 7일 치가 모인 지금은 충분합니다.

버튼이 먹통이 되던 문제는 주로 모바일에서 연타할 때 생겼기 때문에, 모바일에서만
개선이 나타난 것도 수정 효과라는 해석과 맞아떨어집니다.

## 남은 관찰
- 다음 주까지 완료율이 유지되는지 한 번 더 봅니다.
- 수집 이상 신호는 없었습니다(이벤트 0건 일자 없음).
EOF
}

LABELS=("시작 전" "설계" "설계확인 (사람 차례)" "구현" "리뷰 (1차)" "수정 (1차)" "리뷰 통과 → 통합" "배포 (빌드 대기)" "배포 확인 → 검증" "검증 통과 → 해결" "데이터 — 측정 명세" "데이터 — 1회차 (판단 이르다)" "데이터 — 2회차 (성과 있음)")

do_next() {
  guard
  [ -f "$MARKER" ] || do_reset
  local cur next
  cur="$(state_step)"
  next=$((cur + 1))
  if [ "$next" -gt "$TOTAL" ]; then echo "끝 — 이미 $TOTAL/$TOTAL 입니다 (reset 으로 처음부터)"; exit 0; fi
  load_lib
  "step_$next"
  state_write "$next" "${LABELS[$next]}"
  echo "진행 — $next/$TOTAL (${LABELS[$next]})"
}

# 실패하면 어디서 죽었는지 stderr 로 남긴다(대시보드 API 가 이 출력을 그대로 보여 준다)
trap 'echo "demo-play 실패: 줄 $LINENO: $BASH_COMMAND" >&2' ERR

# 쓰기 명령(start/next/reset/clean)은 한 번에 하나만 — 버튼 연타·두 화면 동시 조작이 겹치지 않게.
# 15초 넘게 잡혀 있으면 죽은 잠금으로 보고 걷는다.
PLAYLOCK="${TMPDIR:-/tmp}/mentis-demo-play.lock"
play_lock() {
  local i=0
  until mkdir "$PLAYLOCK" 2>/dev/null; do
    local m; m="$(stat -f '%m' "$PLAYLOCK" 2>/dev/null || echo 0)"
    [ $(($(date +%s) - m)) -gt 15 ] && { rm -rf "$PLAYLOCK"; continue; }
    i=$((i + 1))
    [ "$i" -ge 100 ] && { echo "다른 데모 진행이 끝나기를 10초 기다렸지만 겹칩니다 — 잠시 뒤 다시" >&2; exit 1; }
    sleep 0.1
  done
  trap 'rm -rf "$PLAYLOCK"' EXIT
}

case "${1:-status}" in
  reset) play_lock; do_reset ;;
  start) play_lock; do_reset; do_next ;;
  next) play_lock; do_next ;;
  auto)
    gap="${2:-8}"
    play_lock
    [ -f "$MARKER" ] || do_reset
    while [ "$(state_step)" -lt "$TOTAL" ]; do do_next; sleep "$gap"; done
    ;;
  status)
    [ -f "$STATE" ] && cat "$STATE" || echo '{ "step": -1, "total": '"$TOTAL"', "label": "없음" }'
    ;;
  clean)
    play_lock
    guard
    presence_kill 2>/dev/null || true
    rm -rf "$ROOT"
    echo "삭제 완료: $ROOT"
    ;;
  *) echo "쓰임: demo-play.sh {start|next|reset|status|auto [초]|clean}" >&2; exit 1 ;;
esac

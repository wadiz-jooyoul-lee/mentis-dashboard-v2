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
TOTAL=14

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
  retro_office_end
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
  # 켜진 담당자 줄 — 화면 동작이 바뀌는 개발 오더라 산출자를 뺀 다섯이 켜진다.
  # 이 줄을 쓰는 헬퍼(dobby_v2_set_roles)는 설치된 플러그인 판에 따라 없을 수 있어, 같은 모양의 줄을 직접 적는다.
  grep -q '^- \*\*담당자\*\*:' "$ROOT/$KEY/status.md" || \
    sed -i '' 's/^- \*\*단계 규칙\*\*: 다섯 담당자$/- **단계 규칙**: 다섯 담당자\n- **담당자**: 기획자, 개발자, 리뷰어, 배포담당, 테스터/' "$ROOT/$KEY/status.md"
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
| 정한 것 | 고른 답 | 왜 | 버린 안 |
|---|---|---|---|
| 연타를 막는 방법 | 요청 중에는 버튼을 잠근다 | 신청은 한 번이면 되는 동작이라 잠금이 단순하다 | 디바운스 — 마지막 클릭을 기다리는 동안 반응이 늦어 보인다 |
| 실패했을 때 버튼 문구 | "다시 시도"로 통일한다 | 자동 결정 — 이슈에 문구가 적혀 있지 않아 다른 화면의 관례를 따랐다. 확인해 보세요: 신청이 실패하면 버튼 글자가 "다시 시도"로 바뀝니다 | "알림 신청" 그대로 둔다 — 실패했는지 알 수 없다 |

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

## [major] 요청이 실패하면 버튼이 계속 잠겨 있습니다
- 설계와 구현: 구현이 설계와 다름
- 근거: `src/components/openplan/NotifyButton.tsx:58` — 요청이 실패한 경로에서 잠금을 풀지 않는다. 설계는 "완료/실패 시 해제"다.
- 재현 조건: 네트워크를 끊고 알림 신청 버튼을 누른다. 버튼이 계속 비활성으로 남는다.
- 수정 제안: 요청을 try/finally 로 감싸 finally 에서 잠금을 푼다.

## [nit] 일련번호 비교에 이유가 적혀 있지 않습니다
- 근거: `src/hooks/useNotifyState.ts:21` — 왜 `>=` 가 아니라 `>` 인지 주석 한 줄이 있으면 좋다.

## 지적이 없는 영역
- 성능: 확인함 — 문제 없음
- 데이터 수집: 해당 없음 — 수집 코드에 닿지 않는다
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

## 지적이 없는 영역
- 정확성: 확인함 — 문제 없음
- 성능: 확인함 — 문제 없음
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
  # 빌드가 30분을 넘겨 자동 실행이 사람에게 묻는 장면 — 일곱 칸을 가진 새 형식 질문.
  # 자동 실행(run.sh)이 남기는 것과 같은 모양이다. 질문을 남기는 헬퍼는 설치된 플러그인 판에 따라
  # 새 형식을 모를 수 있어 파일을 직접 쓴다. 다음 단계에서 답한 것으로 닫는다.
  jq -n --arg id "$(date '+%Y%m%d-%H%M%S')" --arg at "$(now)" --arg cwd "$ROOT/.workspace/$KEY" '{
    v: 2, id: $id, kind: "choice",
    title: "빌드가 30분째 끝나지 않습니다. 더 기다릴까요?",
    what: "dev 로 가는 PR 을 합쳤고 빌드가 끝나기를 기다리고 있습니다.",
    why: "기다려도 오지 않는 것인지 조금 늦는 것인지 여기서는 알 수 없습니다",
    tried: ["30분 동안 기다렸습니다 → 아직 끝나지 않았습니다"],
    options: [
      {label: "30분 더 기다리기", does: "같은 자리에서 30분을 더 기다립니다", effect: "그 사이 끝나면 배포를 이어 갑니다", recommended: true, reason: "조금 늦는 경우가 많습니다"},
      {label: "그만 기다리기", does: "자동 실행을 끝냅니다", effect: "원인을 확인한 뒤 자동 실행을 다시 시작해야 합니다", recommended: false, reason: ""}
    ],
    choices: ["30분 더 기다리기", "그만 기다리기"],
    todo: "빌드 화면에서 빌드가 돌고 있는지 확인해 주세요",
    after: "30분 더 기다리기를 고르면 같은 자리에서 30분을 더 기다립니다",
    from: {role: "shell", session: "", cwd: $cwd, resume: false},
    created: $at, answer: null, note: ""
  }' > "$ROOT/$KEY/ask.json"
  dobby_event "$KEY" "질문 — 빌드가 30분째 끝나지 않습니다. 더 기다릴까요?"
  presence deploy-agent
}

# 열린 질문에 답을 적고 닫아 둔다(asks/ 로 옮긴다). 질문이 없으면 아무것도 하지 않는다.
answer_ask() { # 답
  local f="$ROOT/$KEY/ask.json"
  [ -f "$f" ] || return 0
  mkdir -p "$ROOT/$KEY/asks"
  jq --arg a "$1" --arg at "$(now)" '.answer = {value: $a, at: $at} | .closed = {result: $a, at: $at}' "$f" \
    > "$ROOT/$KEY/asks/$(jq -r .id "$f").json" && rm -f "$f"
  dobby_event "$KEY" "질문에 답함 — $1"
}

step_8() { # 배포 확인 → 검증 시작
  answer_ask "30분 더 기다리기"
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

# ── 3막: 회고 (데이터까지 본 뒤, 멈춘 오더를 다섯 담당자가 돌아본다) ──────────
# 오피스에 떠 있을 수 있는 회고 탁자를 걷는다. lib 없이도 되게 수신 API 를 직접 부른다(리셋·삭제 전에, 오더 폴더가 아직 있을 때)
retro_office_end() {
  curl -s -m 1 -X POST -H 'content-type: application/json' \
    -d "{\"kind\":\"retro\",\"op\":\"end\",\"key\":\"$KEY\"}" \
    "${ORCHESTRATION_OFFICE_INBOX:-http://127.0.0.1:6898/dobby}" >/dev/null 2>&1 || true
}

step_13() { # 회고 시작 — 오피스에서 다섯 담당자가 회고 탁자에 둘러앉는다
  dobby_event "$KEY" "회고 시작 — 잘못한 판단과 토큰 사용을 돌아봅니다"
  dobby_retro_office "$KEY" start
}

step_14() { # 회고록 완성 — 대시보드 회고 탭과 오피스 회고 책장에 꽂힌다
  cat > "$ROOT/$KEY/retro.json" <<EOF
{
  "basis": { "phase": "해결", "lastSession": "demo", "changes": 0, "testRounds": 1, "madeAt": "$(now)" },
  "measure": {
    "fastPct": 20,
    "reuseRule": { "maxCtx": 300000, "maxGap": 3600 },
    "sessions": 6,
    "missing": 0,
    "medians": { "start": 42000, "first": 61000, "startup": 38 },
    "totals": {
      "actual": { "cost": 1840000, "time": 5400 },
      "allNew": { "cost": 2110000, "time": 6100 },
      "rule": { "cost": 1760000, "time": 5200 },
      "best": { "cost": 1690000, "time": 5000 }
    },
    "byStage": [
      { "group": "설계", "sessions": 1, "calls": 38, "cost": 420000, "active": 1100 },
      { "group": "구현", "sessions": 2, "calls": 74, "cost": 690000, "active": 2000 },
      { "group": "리뷰", "sessions": 2, "calls": 41, "cost": 380000, "active": 1200 },
      { "group": "배포·검증", "sessions": 1, "calls": 33, "cost": 350000, "active": 1100 }
    ],
    "segments": [
      { "when": "$(day -8) 10:02", "stage": "설계", "group": "설계", "mode": "새로", "calls": 38, "ctxStart": 0, "ctxEnd": 96000, "cost": 420000, "active": 1100, "judge": "첫 세션" },
      { "when": "$(day -8) 10:40", "stage": "구현", "group": "구현", "mode": "새로", "calls": 52, "ctxStart": 41000, "ctxEnd": 148000, "cost": 470000, "active": 1400, "gap": 600, "altCost": 520000, "altTime": 1500, "diffPct": 11, "judge": "맞음" },
      { "when": "$(day -8) 11:15", "stage": "리뷰 (1차)", "group": "리뷰", "mode": "새로", "calls": 22, "ctxStart": 39000, "ctxEnd": 88000, "cost": 210000, "active": 700, "gap": 120, "judge": "리뷰는 새로(독립)" },
      { "when": "$(day -8) 11:32", "stage": "수정 (1차)", "group": "구현", "mode": "새로", "calls": 22, "ctxStart": 44000, "ctxEnd": 92000, "cost": 220000, "active": 600, "gap": 90, "altCost": 140000, "altTime": 420, "diffPct": -36, "judge": "틀림", "best": "이어 씀" },
      { "when": "$(day -8) 11:50", "stage": "리뷰 (2차)", "group": "리뷰", "mode": "새로", "calls": 19, "ctxStart": 39000, "ctxEnd": 71000, "cost": 170000, "active": 500, "gap": 60, "judge": "리뷰는 새로(독립)" },
      { "when": "$(day -8) 12:10", "stage": "배포·검증", "group": "배포·검증", "mode": "새로", "calls": 33, "ctxStart": 43000, "ctxEnd": 104000, "cost": 350000, "active": 1100, "gap": 300, "altCost": 365000, "altTime": 1150, "diffPct": 4, "judge": "맞음" }
    ]
  },
  "summary": "설계에서 응답이 늦게 오는 경우를 빼먹어 리뷰에서 한 번 되돌아왔습니다. 나머지는 한 번에 통과했고, 고친 뒤 알림 신청 완료율이 올랐습니다.",
  "defects": [
    {
      "title": "늦게 온 응답이 화면을 덮어쓰는 경우를 설계에서 빼먹음",
      "change": 0,
      "foundAt": "리뷰",
      "couldAt": "설계",
      "judgment": "요청 중에 버튼만 잠그면 충분하다고 봤습니다",
      "what": "버튼을 잠가도, 먼저 보낸 요청의 응답이 늦게 도착하면 화면이 '신청 전'으로 되돌아갔습니다. 리뷰 1차에서 지적받아 고쳤습니다.",
      "why": "문제를 '두 번 누름'으로만 보고, 응답이 도착하는 순서는 따져 보지 않았습니다.",
      "prevent": "요청이 겹칠 수 있는 화면은 설계에서 '응답이 뒤바뀌어 도착하면 어떻게 되나'를 반드시 적습니다.",
      "causes": ["설계 확인 목록에 응답 순서 항목이 없음"],
      "fixes": [
        { "where": "스킬", "target": "설계 확인 목록", "change": "요청이 겹치는 화면이면 응답 순서가 뒤바뀌는 경우를 적는 칸을 넣습니다." },
        { "where": "사람", "change": "이슈에 '연타하면 먹통'처럼 증상만 있으면, 재현 조건(느린 통신 등)을 함께 적어 줍니다." }
      ]
    }
  ],
  "sessionFindings": [
    { "title": "리뷰 지적을 고칠 때 새 세션을 열어 토큰을 더 썼습니다", "why": "구현 세션이 90초 전에 끝났고 대화도 작아서, 이어 썼다면 36% 쌌습니다.", "impact": 80000 },
    { "title": "리뷰를 매번 새 세션으로 연 것은 맞았습니다", "why": "구현한 대화를 들고 리뷰하면 자기 코드를 너그럽게 봅니다." }
  ],
  "ruleProposals": [
    { "title": "리뷰 지적 수정은 구현 세션을 이어 씁니다", "target": "이어 쓰기 기준", "value": "앞 세션이 5분 안에 끝났고 대화가 15만 이하면 이어 쓰기", "why": "이번 오더에서 8만을 아낄 수 있었습니다." }
  ],
  "proposals": [
    { "type": "스킬", "title": "설계 확인 목록에 응답 순서 항목 추가", "target": "do 설계 단계", "text": "요청이 겹칠 수 있는 화면은 응답이 뒤바뀌어 도착하는 경우를 적는다." }
  ]
}
EOF
  dobby_event "$KEY" "회고 완료 — 잘못한 판단 1건, 고칠 곳 2곳"
  dobby_retro_office "$KEY" end "잘못한 판단 1건"
}

LABELS=("시작 전" "설계" "설계확인 (사람 차례)" "구현" "리뷰 (1차)" "수정 (1차)" "리뷰 통과 → 통합" "배포 (빌드 대기 — 질문)" "배포 확인 → 검증" "검증 통과 → 해결" "데이터 — 측정 명세" "데이터 — 1회차 (판단 이르다)" "데이터 — 2회차 (성과 있음)" "회고 — 다섯 담당자가 돌아보는 중" "회고 — 회고록 완성")

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
    retro_office_end
    presence_kill 2>/dev/null || true
    rm -rf "$ROOT"
    echo "삭제 완료: $ROOT"
    ;;
  *) echo "쓰임: demo-play.sh {start|next|reset|status|auto [초]|clean}" >&2; exit 1 ;;
esac

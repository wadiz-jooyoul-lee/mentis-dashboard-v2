// 데모용 go-dobby 메타 fixture를 격리 디렉터리에 생성한다.
// 실제 $DOBBY_META를 건드리지 않으므로 `npm run dev`(실데이터)는 깨끗하게 유지된다.
// 사용: node scripts/seed-demo.mjs  (대상: $DEMO_META 또는 ./.demo-meta)
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.DEMO_META || path.join(process.cwd(), ".demo-meta");
const BT = "`"; // 마크다운 백틱(템플릿 리터럴 이스케이프 회피용)

/** 상대경로에 내용을 쓴다(중간 폴더 자동 생성). */
function w(rel, content) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

// 재실행 시 깨끗하게 다시 심는다.
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// ── FE1-1187 : K=1, code, 종료(해결→종료) ──────────────────────────
w(
  "FE1-1187/status.md",
  `# FE1-1187 상태

## 이슈/작업
- FE1-1187 · 버그 · 로그인 버튼이 간헐적으로 비활성화되는 문제 · https://wadiz.atlassian.net/browse/FE1-1187

## 현재 단계
- **단계**: 종료
- **담당 스킬**: dobby-end
- **갱신**: 2026-07-12 14:40

## 팬아웃
- **에이전트 수(K)**: 1

## 에이전트
| 슬러그 | 이슈/작업 | 브랜치 | 상태 | 라운드 | 갱신 |
|--------|-----------|--------|------|--------|------|
| impl | FE1-1187 | bugfix/FE1-1187 | 완료 | 2 | 2026-07-12 14:10 |

## 단계별 진행
| 단계 | 스킬 | 상태 | 산출물 | 갱신 |
|------|------|------|--------|------|
| 착수·분석 | dobby-start | 완료 | analysis.md | 2026-07-12 13:00 |
| 구현 | dobby-impl | 완료 | implementation.md | 2026-07-12 13:40 |
| 검증 | dobby-test | 완료 | test-runs/20260712-141500/ | 2026-07-12 14:20 |
| 해결 | dobby-resolve | 완료 | (status ## 해결) | 2026-07-12 14:30 |
| 종료 | dobby-end | 완료 | summary.md | 2026-07-12 14:40 |

## 테스트 실행 이력
| 회차 | 시작 | 상태 | 성공/실패/skip | 폴더 |
|------|------|------|----------------|------|
| 1 | 2026-07-12 14:15 | 완료 | 3/0/1 | ${BT}test-runs/20260712-141500/${BT} |

## 워크트리 / 브랜치
| repo | 브랜치 | 경로 |
|------|--------|------|
| wadiz-frontend | ${BT}bugfix/FE1-1187${BT} | ${BT}~/work/dobby-workspace/subtree/wadiz-frontend-FE1-1187${BT} |

## 해결
- **처리 일시**: 2026-07-12 14:30
- **근거**: 리뷰 클린(round-2) · 테스트 결과 ${BT}test-runs/20260712-141500/${BT}(집계 성공3/실패0/skip1) · 통합 브랜치 bugfix/FE1-1187
- **비고**: 추가 수정 여지 없음
`
);

// status.json(정본) — 대시보드는 이걸 우선 읽는다(status.md는 사람용 폴백).
w(
  "FE1-1187/status.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      key: "FE1-1187",
      kind: "issue",
      title: "로그인 버튼이 간헐적으로 비활성화되는 문제",
      type: "버그",
      jira: "https://wadiz.atlassian.net/browse/FE1-1187",
      docPath: null,
      workType: "code",
      phase: "종료",
      skill: "dobby-end",
      k: 1,
      base: "master",
      startedAt: "2026-07-12 13:00",
      updatedAt: "2026-07-12 14:40",
      current: "종료 완료 — 워크트리 제거, 브랜치 보존",
      agents: [
        { slug: "impl", issue: "FE1-1187", branch: "bugfix/FE1-1187", state: "완료", round: 2, updatedAt: "2026-07-12 14:10" },
      ],
      progress: [
        { phase: "착수·분석", skill: "dobby-start", state: "완료", artifact: "analysis.md", updatedAt: "2026-07-12 13:00" },
        { phase: "구현", skill: "dobby-impl", state: "완료", artifact: "implementation.md", updatedAt: "2026-07-12 13:40" },
        { phase: "검증", skill: "dobby-test", state: "완료", artifact: "test-runs/20260712-141500/", updatedAt: "2026-07-12 14:20" },
        { phase: "종료", skill: "dobby-end", state: "완료", artifact: "summary.md", updatedAt: "2026-07-12 14:40" },
      ],
      testHistory: [
        { round: 1, startedAt: "2026-07-12 14:15", state: "완료", pass: 3, fail: 0, skip: 1, folder: "test-runs/20260712-141500/" },
      ],
      worktrees: [
        { repo: "wadiz-frontend", branch: "bugfix/FE1-1187", path: "~/work/dobby-workspace/subtree/wadiz-frontend-FE1-1187" },
      ],
      deliverables: [],
      resolution: {
        at: "2026-07-12 14:30",
        evidence: "리뷰 클린(round-2) · 테스트 성공3/실패0/skip1 · 통합 브랜치 bugfix/FE1-1187",
        note: "추가 수정 여지 없음",
      },
    },
    null,
    2
  ) + "\n"
);

w(
  "FE1-1187/analysis.md",
  `# FE1-1187 분석

## 원인
로그인 버튼의 disabled 상태가 폼 검증 debounce와 경쟁 상태(race)에 빠져,
입력이 유효해도 간헐적으로 비활성으로 남는다.

- src/features/auth/LoginForm.tsx:82 — useEffect가 isValid를 debounce 결과로만 갱신
- 빠른 입력 시 마지막 debounce 콜백이 이전 상태를 덮어씀

## 수정 설계
- isValid 계산을 debounce 밖(동기)에서 파생값으로 계산하도록 변경
- debounce는 "검증 메시지 표시"에만 사용

### 더 단순한 대안
useMemo로 isValid를 즉시 파생하면 effect 자체가 불필요.
`
);

w(
  "FE1-1187/implementation.md",
  `# FE1-1187 구현 요약

## 건드린 파일
- src/features/auth/LoginForm.tsx — isValid를 useMemo 파생값으로 변경, debounce는 메시지 표시 전용

## 핵심 설계 결정
- effect 제거로 race 원천 차단
- 커밋: fix: FE1-1187 로그인 버튼 비활성 race 수정 (a1b2c3d)
- 푸시 브랜치: bugfix/FE1-1187

## 리뷰
- (round-1) **minor** LoginForm.tsx:90 — debounce cleanup 누락 → round-2에서 반영
- (round-2) 클린
`
);

w(
  "FE1-1187/test-runs/20260712-141500/result.md",
  `# FE1-1187 테스트 결과 (1회차)

**환경**: RC2 (rc2.wadiz.kr) · **국내/글로벌**: 국내 · **일시**: 2026-07-12 14:15
**대상 브랜치**: bugfix/FE1-1187

## 한눈 요약
- 종합 판정: **부분 통과** (성공 3 / 실패 0 / skip 1)
- 사용한 test-plan: test-plan.md

## 시나리오
| ID | 시나리오 | 기대 | 실제 | 판정 |
|----|----------|------|------|------|
| S1 | 유효 입력 후 버튼 활성 | 활성 | 활성 | PASS |
| S2 | 빠른 연속 입력 | 활성 유지 | 활성 유지 | PASS |
| S3 | 빈 입력 시 비활성 | 비활성 | 비활성 | PASS |
| S4 | SNS 로그인 경로 | 정상 | 계정 없음 | SKIP |

## 근거
- S2: 네트워크 로그상 debounce 경쟁 없음 확인
- S4: TEST_LOGIN_ID 미설정으로 로그인 필요 경로 skip
`
);

w(
  "FE1-1187/summary.md",
  `# FE1-1187 종료 서머리

## 이슈/작업
- FE1-1187 · 버그 · 로그인 버튼이 간헐적으로 비활성화되는 문제 · https://wadiz.atlassian.net/browse/FE1-1187

## 종료 처리
- 처리 일시: 2026-07-12 14:40 · 워크트리 처리: 제거(해결 상태, 미푸시 커밋 없음)

| repo | 브랜치(보존) | 경로 | 처리 |
|------|--------------|------|------|
| wadiz-frontend | bugfix/FE1-1187 | ~/work/dobby-workspace/subtree/wadiz-frontend-FE1-1187 | 제거 |

## 작업 요약 (analysis.md에서 이어받음)
- 원인 위치: LoginForm.tsx:82 debounce race
- 수정 설계: isValid를 useMemo 파생값으로 변경
`
);

// ── FE1-2200 : K≥2, code, 리뷰중 (오케스트레이션 + 변경) ────────────
w(
  "FE1-2200/status.md",
  `# FE1-2200 상태

## 이슈/작업
- FE1-2200 · 기능 · 프로젝트 상세 리뉴얼(헤더·후원 영역 분리) · https://wadiz.atlassian.net/browse/FE1-2200

## 현재 단계
- **단계**: 리뷰중
- **담당 스킬**: dobby-order
- **갱신**: 2026-07-12 15:05

## 팬아웃
- **에이전트 수(K)**: 2

## 에이전트
| 슬러그 | 이슈/작업 | 브랜치 | 상태 | 라운드 | 갱신 |
|--------|-----------|--------|------|--------|------|
| header | FE1-2201 | feature/FE1-2201 | 리뷰중 | 1 | 2026-07-12 15:00 |
| reward | FE1-2202 | feature/FE1-2202 | 수정중 | 1 | 2026-07-12 15:03 |
| review-agent | - | - | 진행중 | 1 | 2026-07-12 15:05 |

## 단계별 진행
| 단계 | 스킬 | 상태 | 산출물 | 갱신 |
|------|------|------|--------|------|
| 착수·분석 | dobby-start | 완료 | analysis.md | 2026-07-12 14:00 |
| 구현 | dobby-impl | 완료 | implementation.md | 2026-07-12 14:50 |
| 리뷰 | dobby-order | 진행중 | reviews/round-1/ | 2026-07-12 15:05 |

## 워크트리 / 브랜치
| repo | 브랜치 | 경로 |
|------|--------|------|
| wadiz-frontend | feature/FE1-2200 | ~/work/dobby-workspace/subtree/wadiz-frontend-FE1-2200 |
| wadiz-frontend | feature/FE1-2201 | ~/work/dobby-workspace/subtree/wadiz-frontend-FE1-2201 |
| wadiz-frontend | feature/FE1-2202 | ~/work/dobby-workspace/subtree/wadiz-frontend-FE1-2202 |
`
);

w(
  "FE1-2200/orchestration.md",
  `# FE1-2200 오케스트레이션

**모드**: A (대화형)

## 범위 배분
| 영역 | 담당 | 사유 |
|------|------|------|
| 헤더/GNB | header | 파일 오너십 분리 (components/detail/Header/**) |
| 후원 영역 | reward | 파일 오너십 분리 (components/detail/Reward/**) |

## 에이전트 상태
| 슬러그 | 이슈/작업 | 브랜치 | 상태 | 라운드 | 갱신 |
|--------|-----------|--------|------|--------|------|
| header | FE1-2201 | feature/FE1-2201 | 리뷰중 | 1 | 2026-07-12 15:00 |
| reward | FE1-2202 | feature/FE1-2202 | 수정중 | 1 | 2026-07-12 15:03 |

## 공유 데이터 계약
- ProjectDetailContext의 fundingState는 reward가 소유, header는 읽기만.

## 이벤트 로그
- 2026-07-12 14:00 P1 착수·분석 시작 (header, reward)
- 2026-07-12 14:50 P4 구현 완료 보고 (header)
- 2026-07-12 14:55 P4 구현 완료 보고 (reward)
- 2026-07-12 15:00 P5 리뷰 시작 (review-agent)
- 2026-07-12 15:03 round-1 findings: reward major 1건 → 수정중
`
);

w(
  "FE1-2200/agents/header.md",
  `# header 에이전트 계약

## 역할
프로젝트 상세 헤더/GNB 영역 구현.

## 수정 허용 범위 (화이트리스트)
- src/components/detail/Header/**
- src/components/detail/Nav/**

## 금지
- Reward/**, 공유 컨텍스트 정의 파일 수정 금지(읽기만).
`
);

w(
  "FE1-2200/agents/reward.md",
  `# reward 에이전트 계약

## 역할
프로젝트 상세 후원(Reward) 영역 구현.

## 수정 허용 범위 (화이트리스트)
- src/components/detail/Reward/**

## 금지
- Header/**, ProjectDetailContext 정의 수정 금지(읽기만).
`
);

w(
  "FE1-2200/reviews/round-1/reward.md",
  `# reward 리뷰 (round-1)

- **major** src/components/detail/Reward/RewardList.tsx:44 — fundingState 직접 변이(공유 계약 위반). 읽기 전용으로 바꾸고 액션 디스패치 사용.
- **minor** RewardCard.tsx:12 — 사용하지 않는 import.
- **nit** 커밋 메시지에 이슈 키 누락(feat: reward ... → feat: FE1-2202 ...).

범위 준수: OK (Reward/** 안에서만 수정).
`
);

// 에이전트 대화 로그(변경 탭용) + agent-logs.json (절대경로로 매핑)
const rewardLog = path.join(ROOT, "FE1-2200", "agent-logs", "reward.jsonl");
fs.mkdirSync(path.dirname(rewardLog), { recursive: true });
fs.writeFileSync(
  rewardLog,
  [
    JSON.stringify({
      message: {
        content: [
          {
            type: "tool_use",
            name: "Edit",
            input: {
              file_path: "/repo/src/components/detail/Reward/RewardList.tsx",
              old_string: "ctx.fundingState = next;",
              new_string: "dispatch(setFunding(next));",
            },
          },
        ],
      },
    }),
    JSON.stringify({
      message: {
        content: [
          {
            type: "tool_use",
            name: "Bash",
            input: { command: "git commit --no-verify -m 'feat: FE1-2202 후원 영역 분리'" },
          },
        ],
      },
    }),
    JSON.stringify({
      message: {
        content: [{ type: "text", text: "리뷰 major 반영: fundingState 직접 변이 제거하고 액션 디스패치로 교체. 재푸시 완료." }],
      },
    }),
  ].join("\n") + "\n"
);
w("FE1-2200/agent-logs.json", JSON.stringify({ reward: rewardLog }, null, 2) + "\n");

// ── TASK-login-refactor : 비소스(문서·리서치), 산출중 ───────────────
w(
  "TASK-login-refactor/status.md",
  `# TASK-login-refactor 상태

## 이슈/작업
- TASK-login-refactor · 작업 · 로그인 리팩터링 리서치 · 문서: ~/work/docs/login-refactor-brief.md

## 현재 단계
- **단계**: 산출중
- **담당 스킬**: dobby-produce
- **갱신**: 2026-07-12 16:10

## 팬아웃
- **에이전트 수(K)**: 1

## 에이전트
| 슬러그 | 이슈/작업 | 브랜치 | 상태 | 라운드 | 갱신 |
|--------|-----------|--------|------|--------|------|
| research | TASK-login-refactor | - | 구현중 | 0 | 2026-07-12 16:10 |

## 단계별 진행
| 단계 | 스킬 | 상태 | 산출물 | 갱신 |
|------|------|------|--------|------|
| 착수·분석 | dobby-start | 완료 | analysis.md | 2026-07-12 15:40 |
| 산출 | dobby-produce | 진행중 | deliverables/ | 2026-07-12 16:10 |
`
);

w(
  "TASK-login-refactor/produce.md",
  `# TASK-login-refactor 산출 요약

## 산출 대상
로그인 플로우 리팩터링 방향 리서치 리포트 (repo 밖 meta 산출).

## 구성
1. 현행 로그인 상태관리 문제점
2. 대안 3가지 비교 (Context / Zustand / 서버 상태)
3. 권장안 + 마이그레이션 단계

## 근거 출처
- src/features/auth/** (파일:라인 명시)
- 사내 문서 docs/auth.md

## 산출물
- deliverables/login-refactor-report.md

## 미해결
- SSR 세션 처리 방식은 BE 협의 필요(미확인).
`
);

// ── FE2-500 : 최소 status(착수만) ──────────────────────────────────
w(
  "FE2-500/status.md",
  `# FE2-500 상태

## 이슈/작업
- FE2-500 · 버그 · 결제 모듈 금액 반올림 오류 · https://wadiz.atlassian.net/browse/FE2-500

## 현재 단계
- **단계**: 착수
- **담당 스킬**: dobby-start
- **갱신**: 2026-07-12 17:20

## 팬아웃
- **에이전트 수(K)**: 1

## 워크트리 / 브랜치
| repo | 브랜치 | 경로 |
|------|--------|------|
| wadiz-payment | bugfix/FE2-500 | ~/work/dobby-workspace/subtree/wadiz-payment-FE2-500 |
`
);

// ── 잡 로그(.mentis-jobs) : 완료 1 + 정지 1 ────────────────────────
w(
  ".mentis-jobs/FE1-1187/run.json",
  JSON.stringify({ key: "FE1-1187", pid: 999999, startedAt: 1752300000000 }) + "\n"
);
w(
  ".mentis-jobs/FE1-1187/run.log",
  [
    JSON.stringify({ type: "system", subtype: "init", session_id: "sess-abc-123" }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "FE1-1187 착수합니다. 팬아웃 K를 판단합니다." }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "git fetch origin master" } }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "src/features/auth/LoginForm.tsx" } }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "구현·푸시 완료. 리뷰를 요청합니다." }] } }),
    JSON.stringify({ type: "result", is_error: false }),
  ].join("\n") + "\n"
);
w(
  ".mentis-jobs/QA-3001/run.json",
  JSON.stringify({ key: "QA-3001", pid: 999998, startedAt: 1752301000000, stoppedAt: 1752301500000 }) + "\n"
);
w(
  ".mentis-jobs/QA-3001/run.log",
  [
    JSON.stringify({ type: "system", subtype: "init", session_id: "sess-qa-999" }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "QA-3001 분석 중…" }] } }),
  ].join("\n") + "\n"
);

console.log(`데모 fixture 생성 완료: ${ROOT}`);
console.log("실행:  DOBBY_META_PATH=\"" + ROOT + "\" npm run dev   (또는 npm run demo)");

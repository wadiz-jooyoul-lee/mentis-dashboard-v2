# Mentis Dashboard v2 설계 (go-dobby 대응)

> 대상: `mentis-plugins`의 **`go-dobby`** 플러그인(`feature/common-dobby` 브랜치).
> 출처: `plugins/go-dobby/reference/redesign-spec.md`(SSOT) + 7개 `dobby-*` SKILL.md.
> 현재 대시보드(v1)는 work-dobby의 `.issue-start/.issue-test/.issue-end/.agent-start` **분리 폴더**를 읽는다.
> v2는 go-dobby의 **이슈당 단일 폴더 + 단일 status.md 인덱스** 모델을 읽는다.

---

## 1. 왜 v2인가 — 데이터 모델의 근본 변화

| | work-dobby (v1이 읽는 것) | go-dobby (v2가 읽을 것) |
|---|---|---|
| 진입 | issue-start(단독) vs i-order(오케스트레이션) **2경로** | `dobby-order` **단일 진입점** |
| 폴더 | `$META/.issue-start/{키}/`, `.issue-test/{키}/`, `.issue-end/{키}/`, `.agent-start/{에픽}/` **4트리** | `$DOBBY_META/{키}/` **이슈당 폴더 1개** |
| 인덱스 | 트리마다 별도 `status.md`/`summary.md`/`orchestration.md` | **단일 `status.md`** 하나가 전 단계 인덱스 |
| 단독 vs 다중 | 별개 개념(개별 이슈 vs 에픽) | **팬아웃 K**로 통합 — K=1은 "에이전트 1명 오케스트레이션" |
| 작업 종류 | 코드 전제 | **work-type**: `code` / `비소스`(문서·리서치) |
| 종료 | issue-end(해결+정리 혼재) | `dobby-resolve`(해결 표시) + `dobby-end`(정리) 분리 |
| 문서 전용 | 없음 | `TASK-{slug}` 작업 키 지원 |

**핵심 결론**: v1의 5개 화면 영역(issue-start / issue-test / issue-end / lifecycle / orchestration)은 v2에서 **하나의 엔티티 "오더(Order)"**로 수렴한다. 오더 = `$DOBBY_META/{키}/` 하나. K=1이든 K≥2든, code든 비소스든 같은 엔티티이며 K/work-type/현재 단계가 속성일 뿐이다. → 대시보드는 근본적으로 **"오더 목록 + 오더 상세"** 두 축으로 단순해진다.

---

## 2. go-dobby 폴더/파일 스키마 (파서가 읽을 대상)

경로는 모두 `$DOBBY_META = ${DOBBY_META_PATH:-$DOBBY_WORKSPACE/meta}` 기준. 워크트리는 `$DOBBY_WORKSPACE/subtree/{repo}-{키}`.

```
$DOBBY_META/{키}/
├── status.md            # ★ 단일 진행 인덱스 (dobby-start 생성, 모든 스킬이 갱신)
├── analysis.md          # 착수·분석·수정 설계 (dobby-start) — 자유형 산문
├── implementation.md    # 구현 요약 + (K=1) ## 리뷰 (dobby-impl, code)
├── produce.md           # 산출 요약 + (K=1) ## 리뷰 (dobby-produce, 비소스)
├── test-plan.md         # 시나리오 S1,S2… (dobby-start 초안 → dobby-test 확정)
├── test-runs/{YYYYMMDD-HHMMSS}/   # 회차별(덮어쓰지 않음, dobby-test)
│   ├── result.md        #   한눈 요약→실패 상세→전체 표→근거. 판정 PASS/FAIL/SKIP
│   └── *.png            #   스크린샷 근거
├── deliverables/        # 비소스 meta 산출물 (dobby-produce, repo 밖일 때만)
├── code-changes/        # 종료 전 스냅샷 (dobby-end)
│   ├── {repo}.commits   #   git log --oneline (raw)
│   └── {repo}.diff      #   git diff (raw, 마크다운 아님)
└── summary.md           # 종료 서머리 (dobby-end)

# K≥2일 때만 루트 키 폴더에 추가
├── orchestration.md     # 관제탑 보드(상태표·범위배분·이벤트로그)
├── agents/{슬러그}.md · agents/review-agent.md   # 계약(불변)
├── reviews/round-{n}/{슬러그}.md                 # 리뷰 findings
└── agent-logs.json      # {슬러그}→대화 로그 경로 맵
```

### status.md 스키마 (SSOT §6 / dobby-start)

```markdown
# {키} 상태
## 이슈/작업            - 키 · 타입 · 제목 · Jira URL(또는 문서 경로)
## 현재 단계            - **단계**: … / **담당 스킬**: … / **갱신**: …
## 팬아웃               - **에이전트 수(K)**: {n}
## 에이전트             | 슬러그 | 이슈/작업 | 브랜치 | 상태 | 라운드 | 갱신 |
## 단계별 진행          | 단계 | 스킬 | 상태 | 산출물 | 갱신 |
## 테스트 실행 이력      | 회차 | 시작 | 상태 | 성공/실패/skip | 폴더 |   (dobby-test가 누적)
## 워크트리 / 브랜치     | repo | 브랜치 | 경로 |
## 해결                 - **처리 일시** / **근거** / **비고**   (dobby-resolve가 추가)
```

### 상태 값 (defensive 파싱 필수 — 스킬 간 드리프트 있음)

- **현재 단계(`단계`)**: 템플릿은 `착수|분석|구현|리뷰|통합|검증|해결|종료`지만 실제 기록 리터럴은 `착수` / `분석완료` / `구현중` / **`산출중`**(템플릿에 없음) / `리뷰중` / `수정중` / `통합완료` / `검증`·`검증완료` / `해결` / `종료`. → **prefix 매칭 + superset 유지**.
- **에이전트 상태**: 서브 `대기→분석중→구현중→리뷰중→수정중→재통합대기→완료`, 리뷰 `대기→진행중→완료`. (v1 `parseOrchestration`의 `STATE_ORDER`와 **정확히 일치** → 재사용.)
- **테스트 판정**: dobby-test는 영문 `PASS/FAIL/SKIP`, dobby-resolve 집계는 한글 `성공/실패/skip`, 이력 표 상태는 `테스트중/완료/완료(이슈 있음)/중단`. → 세 어휘 모두 정규화.
- **리뷰 심각도**: `blocker`(병합불가) / `major`(강권) / `minor·nit`(사소). blocking = blocker+major.

### 알려진 스키마 갭 (파서는 느슨하게)

1. `analysis.md`·`test-plan.md`·`implementation.md`·`produce.md`는 **자유형 산문**(고정 헤딩·표 없음). → 구조화 파싱하지 말고 마크다운 그대로 렌더 + `## 리뷰` 섹션만 추출.
2. K=1 리뷰는 `implementation.md`/`produce.md`의 `## 리뷰`, K≥2 리뷰는 `reviews/round-{n}/{슬러그}.md` → **두 위치 모두 확인**.
3. `orchestration.md` 보드 표·`agent-logs.json` 키 스키마는 스펙에 명시 없음 → v1 파서 동작(느슨) 유지.
4. 새로 초기화된 status.md에는 `## 테스트 실행 이력`·`## 해결`이 **없다**(나중에 추가됨) → 섹션 부재 허용.

---

## 3. 복사 & 리포지토리 전략  — 확정: 형제 리포

- `mentis-dashboard` → 형제 폴더 **`../mentis-dashboard-v2`**로 복사, **독립 git 리포**로 초기화(v1 히스토리 미상속). v1은 work-dobby 사용자용으로 보존, 두 대시보드 동시 운영 가능.
- 포트 분리: v1 7153 → v2 **7253**(`package.json` dev/start).
- `package.json` name → `mentis-dashboard-v2`. 의존성·툴체인(Next 14·antd v6)은 그대로.
- 복사 시 제외: `.git`, `node_modules`, `.next`, `.omc/state`. 복사 후 `git init` + 첫 커밋.
- 복사 후 `src/lib`를 대폭 재작성, `src/app` 라우트 개편, `src/components`는 상당수 재사용.

---

## 4. lib 레이어 재설계

### 4.1 config (issues.ts → config.ts로 분리)

- v1의 경로 리졸버(`expandPath`·`readConfigEnv`·`resolveConfig`·`getWorkspaceDir`·`getMetaDir`·`getReposRoot`)를 **`config.ts`로 이동**해 재사용.
- **삭제**: `getIssueTestDir`·`getStartDir`·`getEndDir`·`getAgentStartDir` (분리 트리 소멸).
- v2는 `$DOBBY_META` 하나만 쓴다. 오더 목록 = `readdir($DOBBY_META)` 후 **키 패턴 필터**(`^[A-Za-z][A-Za-z0-9]*-\d+$` 또는 `^TASK-`), 잡 폴더(`.mentis-jobs`)·숨김 폴더 제외.
- `ISSUE_START_DIR` 등 개별 env 제거, `DOBBY_META_PATH`/`DOBBY_WORKSPACE`만. `config.md`가 아직 `.issue-*` 레이아웃을 설명하는 점은 **plugins 쪽 문서 버그로 별도 보고**(코드는 스펙 §5 기준).

### 4.2 단일 리더 `orders.ts` (v1의 issues/lifecycle/orchestration 통합)

```ts
type OrderSummary = {
  key: string;
  kind: "issue" | "task";              // TASK- 접두 여부
  workType: "code" | "nonsource" | null;
  title: string | null;
  type: string | null;                 // Jira 이슈 타입
  jira: string | null;                 // TASK면 문서 경로
  phase: Phase;                        // 현재 단계(정규화)
  skill: string | null;                // 담당 스킬
  k: number | null;                    // 팬아웃 K
  agents: AgentRow[];                  // status.md 에이전트 표 (K≥2면 다수)
  latestRun: TestRunSummary | null;    // 최근 회차 통과율 등
  updatedAt: string | null;            // status.md 갱신
  resolved: boolean; ended: boolean;
};

type OrderDetail = OrderSummary & {
  analysisMd: string | null;
  implementationMd: string | null;     // + reviewSection(## 리뷰)
  produceMd: string | null;            // + reviewSection
  testPlanMd: string | null;
  runs: TestRun[];                      // test-runs/{ts}/ 파싱(회차 선택)
  resolution: Resolution | null;       // ## 해결
  summaryMd: string | null; endWorktrees: EndWorktree[];
  orchestration: Orchestration | null; // K≥2
  contracts: Contract[]; reviews: ReviewFile[]; agentWork: AgentWork[]; // K≥2
  codeChanges: CodeChange[];            // code-changes/{repo}.diff|.commits
};

listOrders(): OrderSummary[]           // readdir + parseStatus(index)만 (가벼움)
getOrder(key): OrderDetail | null      // 폴더 전체 파싱 (검증: ISSUE_KEY_RE|TASK)
getMetrics(): Metric[]                 // 허브 지표 (phase별 카운트 등)
```

- **성능**: `listOrders`는 각 폴더의 `status.md`만 읽는다(상세 파일·로그 파싱 금지). 요청 단위 메모이제이션 도입(v1의 반복 재순회 문제 해소).

### 4.3 파서 (재사용 최대화)

| 파서 | 처리 | 재사용/신규 |
|---|---|---|
| `md.ts` | 표·필드 헬퍼 | **그대로 재사용** |
| `parseStatus.ts` (신규 v2) | status.md 인덱스 전체(이슈/단계/팬아웃/에이전트/단계별/테스트이력/워크트리/해결) | **신규**(v1 것은 test 전용이라 확장) |
| `parseReport.ts` | test-runs/result.md 판정·시나리오 표 | **거의 그대로** (PASS/FAIL/SKIP 이미 지원) |
| `parseOrchestration.ts` | orchestration.md | **그대로 재사용**(상태값 동일) |
| `parseSummary.ts` | summary.md(종료 처리 표) | v1 `parseEnd` **각색** |
| `parseReview.ts` (신규) | `## 리뷰` / reviews/round-n | **신규**(심각도·파일:라인 추출) |
| `parseCodeChanges.ts` (신규) | code-changes/*.diff·*.commits | **신규**(raw git diff 렌더) |
| free-form(analysis/impl/produce/test-plan) | 마크다운 통째 렌더 + `## 리뷰`만 분리 | 파서 불필요 |

- v1의 `parseStart.ts`·`parseEnd.ts`의 상태/워크트리 로직은 신규 `parseStatus.ts`로 흡수 후 폐기.
- `orchestration.ts`의 `parseAgentLog` 재사용하되 **`isMeta` 필터를 `$DOBBY_META/{키}/` 패턴으로 수정**(현재 `/.issue-start/`·`/.agent-start/` 하드코딩은 v2에서 무의미).

---

## 5. 라우트 / 내비게이션 재설계  — 확정: 단일 라우트 + 탭

```
/                         허브 — 오더 전체 지표(단계별 분포·오늘 활동·K 분포)
/orders                   오더 목록 (단일 표: 키·타입·work-type·단계·K·통과율·갱신)
/orders/[key]             오더 상세 — 단일 라우트, 클라이언트 탭 전환
   ├─ 개요 탭             현재 단계 타임라인 + 단계별 진행 표 + 이슈 메타
   ├─ 분석 탭             analysis.md (markdown)
   ├─ 구현/산출 탭        implementation.md 또는 produce.md + ## 리뷰
   ├─ 검증 탭 (code만)   test-runs 회차 선택 → result.md 리포트(+스크린샷)
   ├─ 에이전트 탭 (K≥2)  orchestration 보드 + 계약 + 라운드별 리뷰
   ├─ 변경 탭            code-changes diff + 에이전트 로그 기반 변경
   └─ 종료 탭            summary.md + 워크트리 처리
/agents                   도비 에이전트 소개(정적) — 유지
```

- v1의 `/issue-start`·`/issue-test`·`/issue-end`·`/lifecycle`·`/orchestration` **5개 섹션 → `/orders` 1개로 통합**. `sections.ts` 레지스트리는 대폭 축소(허브 카드 = 오더/에이전트 정도).
- **상세는 단일 라우트 `/orders/[key]` + 클라이언트 탭**. 서버 페이지가 `getOrder(key)`를 **한 번** 로드해 `OrderDetail`에 넘기고, 탭 전환은 클라이언트에서(재파싱 없음). v1처럼 `/[key]`와 `/[key]/changes`가 각각 `getEpic`을 중복 호출하던 문제 제거.
  - 탭 상태는 URL 쿼리(`?tab=changes`)로 동기화해 딥링크·새로고침 보존. 변경 탭의 에이전트 앵커(`#agent-{slug}`)도 유지.
- **`[key]` 페이지에 `ISSUE_KEY_RE|TASK` 검증 + `notFound()`** — v1의 path traversal 결함(P1)을 v2에서 원천 차단.
- **조건부 탭**: work-type=비소스면 검증 탭 숨김·"구현"→"산출" 라벨, K=1이면 에이전트 탭 숨김(status.md 에이전트 1행으로 충분).

---

## 6. 컴포넌트 재사용/신규

**그대로 재사용**: `AppShell`, `AutoRefresh`, `MantisIcon`, `DobbyIcon`, `FeedView`, `DateFoldedTable`, `dobby.ts` 색상, `jira.ts`, `markdown.css`, `IssueReport`(→ 검증 탭), `OrchestrationBoard`(→ 에이전트 탭), `OrchestrationChanges`(→ 변경 탭).

**신규/개편**:
- `OrderList` — 단일 통합 목록(work-type·K·단계 배지 컬럼). v1 4개 List 통합.
- `OrderDetail` — 탭 셸. status.md 인덱스로 어떤 탭을 활성화할지 결정(비소스면 검증 탭 숨김·구현→산출).
- `PhaseTimeline` — 착수→…→종료 진행 표시(단계별 진행 표 기반).
- `ReviewFindings` — 심각도별 findings(신규 파서 대응).
- `OrderLauncher` — ⏸ 2차. v1 `StartList.IssueStartPanel` 각색 → `dobby-order {키}` spawn. 1차 미포함.

**v1 중복 정리 반영**: Jira 키 셀(5곳 복제)·상세 스켈레톤·`roleBySlug`를 공용 컴포넌트로 추출(v1 리뷰 P4).

---

## 7. jobs.ts (잡 실행) — ⏸ 2차로 연기

**1차 범위 = 읽기 전용 뷰어.** 잡 실행/정지/재개(`dobby-order` spawn)는 1차에서 **제외**하고, 복사 시 `jobs.ts`·`/api/issue-start`·`JobConsole`·`OrderLauncher`·콘솔 라우트는 **비활성 또는 미포함**으로 둔다(읽기 경로에 위험 spawn을 섞지 않음).

2차 도입 시 설계(참고용으로만 기록):
- v1 `claude -p "/issue-start {키}"` → **`/dobby-order {키}`** spawn. 잡 폴더 `$DOBBY_META/.mentis-jobs/{키}/` 유지. 피드 파서·`--resume` 그대로.
- v1 리뷰 반영: PID에 **시작시각 대조**(재사용 PID 오인·엉뚱한 그룹 SIGTERM 방지, P2), `result` 없는 종료를 `stopped`/`failed`로 구분.
- API `/api/orders` — 키 검증 유지.

---

## 8. 마이그레이션 요약표

| v1 자산 | v2 처리 |
|---|---|
| `lib/issues.ts` | 경로부 → `config.ts`, 리더부 → `orders.ts` 통합 |
| `lib/lifecycle.ts`·`orchestration.ts` | `orders.ts`로 통합 |
| `lib/parseStart/parseEnd/parseStatus` | `parseStatus.ts`(v2)·`parseSummary.ts`로 재편 |
| `lib/parseReport/parseOrchestration/md/dobby/jira` | **재사용** |
| `app/issue-*`·`lifecycle`·`orchestration` 라우트 | `app/orders/*`로 통합 |
| List 컴포넌트 4종 | `OrderList` 1종 |
| Detail 컴포넌트(Start/End) | `OrderDetail` 탭 |
| `IssueReport`·`Orchestration*` | 탭으로 이식(재사용) |
| `jobs.ts`·API | `/dobby-order` spawn으로 각색 + PID 보강 |

---

## 9. 리스크 / 열린 항목

1. **스키마 갭**: `## 테스트 실행 이력` 컬럼은 스펙 §6에 있으나 스킬 본문엔 미기재, `orchestration.md`/`agent-logs.json`은 어디에도 컬럼 미정의 → 실제 산출 샘플이 나오면 파서 검증 필요. **현재 `$DOBBY_META`에 go-dobby 실데이터가 있는지 먼저 확인** 권장.
2. **단계 리터럴 드리프트**(`산출중` 등 템플릿 밖) → prefix/superset 정규화로 흡수.
3. **config.md 문서 stale**(`.issue-*` 레이아웃 설명) → plugins 리포에 별도 이슈로 보고.
4. v1과 v2가 같은 `$DOBBY_META`를 볼 수 없음(레이아웃 상이) — 두 대시보드 동시 운영 시 각각의 워크스페이스 필요.
5. 비소스(dobby-produce) 오더는 검증 탭이 없고 `deliverables/` 표시가 필요 → 탭 조건부 렌더.

---

## 10. 단계별 구현 계획

**확정 스코프**: 1차 = 읽기 전용 뷰어(P0~P4 + P6). 잡 실행(구 P5)은 2차.

1. **P0** — `../mentis-dashboard-v2` 복사(`.git`/`node_modules`/`.next` 제외), `git init`, 포트 7253·이름 변경, 잡 관련 파일 제거, 빌드 확인.
2. **P1** — `config.ts` 분리 + `orders.ts`의 `listOrders`(status.md만) + `parseStatus.ts`(v2). `/orders` 목록 + `/` 허브 지표.
3. **P2** — `getOrder` 상세 + **단일 라우트 탭 셸**(개요/분석/구현·산출), `?tab=` 동기화. 키 검증·notFound.
4. **P3** — 검증 탭(test-runs, `parseReport` 이식) + 종료 탭(summary).
5. **P4** — 에이전트 탭(K≥2: orchestration/계약/리뷰) + 변경 탭(code-changes/로그). `parseReview`·`parseCodeChanges`. `parseAgentLog`의 `isMeta` 필터 수정.
6. **P6** — 실데이터(또는 샘플 status.md)로 파서 검증·엣지케이스·중복 정리(공용 컴포넌트 추출).
7. **(2차) 잡 실행** — `dobby-order` spawn + 콘솔 + jobs PID 보강 (§7).

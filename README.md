# Mentis Dashboard v2 (go-dobby)

`go-dobby` 플러그인이 `$ORCHESTRATION_META/{키}/` 아래에 쌓는 **오더(이슈/작업) 메타 파일**을 읽어, 진행 상황을 보기 좋게 보여주는 로컬 대시보드입니다.

- Next.js 14 (App Router) · React 18 · TypeScript
- UI: Ant Design v6 · 마크다운: react-markdown + remark-gfm
- 데이터: 서버에서 파일시스템을 직접 읽음 (DB·API 불필요, 읽기 전용)

> v1(`mentis-dashboard`)은 work-dobby의 `.issue-start/.issue-test/.issue-end/.agent-start` 분리 폴더를 읽습니다.
> v2는 go-dobby의 **이슈당 폴더 1개 + 단일 status.md 인덱스** 모델을 읽습니다. 설계: [`docs/v2-design.md`](docs/v2-design.md).

## 무엇을 읽나

모든 작업은 `dobby-order` 하나로 시작하며, 오더 = `$ORCHESTRATION_META/{키}/` 한 폴더입니다. 대시보드는 이를 읽기만 합니다(수정하지 않음).

```
$ORCHESTRATION_META/{키}/                # 키 = FE1-1187 (이슈) 또는 TASK-{slug} (문서 전용)
├─ status.md            # ★ 단일 진행 인덱스: 현재 단계·팬아웃 K·에이전트·단계별 진행·테스트 이력·워크트리·해결
├─ analysis.md          # 착수·분석·수정 설계 (dobby-start)
├─ implementation.md    # 구현 요약 + 리뷰 (dobby-impl, work-type=code)
├─ produce.md           # 산출 요약 + 리뷰 (dobby-produce, work-type=비소스)
├─ test-runs/{시각}/result.md    # 검증 회차 (dobby-test, 덮어쓰지 않음)
├─ summary.md           # 종료 서머리 (dobby-end)
└─ orchestration.md · agents/ · reviews/round-n/ · agent-logs.json  # 오케스트레이션 메타(K=1도 생성; 단일이면 1행·1계약)
```

## 화면

| 경로 | 설명 |
|------|------|
| `/` | 허브. 작업을 **개발(code)·비개발(비소스)** 두 카드로 나눠 오더 수·진행중·리뷰중·완료 지표 표시 |
| `/orchestration?type=code\|nonsource` | 오더 목록(키·실행 모드·에이전트 수·상태 분포·진행률) + 상단 **실행 패널**(dobby-order 실행·진행 로그) |
| `/orchestration/[key]` | 오더 관제 보드 — 에이전트 칸반·완료율·정체 감지·이벤트 로그 + 계약·리뷰·분석·구현/산출·산출물·검증·종료 서머리 통합 |
| `/orchestration/[key]/changes` | 에이전트별 코드 변경(대화 로그 기반 수정 파일·커밋·before→after diff·요약) |
| `/orchestration/console/[key]` | 실행 콘솔 — dobby-order 실시간 stream-json 로그 |
| `/agents` | 도비 에이전트 소개 |
| `/api/orders` | 잡 실행/정지/재개/예약/보관·상태 조회 API (헤드리스 claude spawn) |

- **단독/오케스트레이션 통합**: K=1(단일)과 K≥2(다중)는 같은 오더이며, 팬아웃 K는 속성입니다. K=1은 status.md 에이전트 표로 보드를 합성합니다.
- 모든 페이지는 **30초마다 자동 갱신**(서버 데이터만 재로딩)됩니다. `[key]`는 키 형식을 검증해 존재하지 않으면 404(경로 탈출 방지).
- **잡 실행**: `/orchestration` 상단 실행 패널(텍스트에어리어)에 **이슈 키·이슈/문서 URL·이슈 없는 요구사항/문서**(+ `base=`/`agents=`/`mode=` 인자)를 넣으면 그 내용을 `/dobby-order` 뒤에 그대로 붙여 백그라운드 `claude`로 띄우고 stream-json 로그를 실시간 표시합니다. 잡 폴더 id는 이슈 키/URL이면 그 키, 문서 전용이면 `task-{slug}-{hash}`(→ dobby-order가 만드는 최종 `TASK-` 오더 키와는 별개). 실행 중 프로세스는 시그널 확인 + 명령어(`ps`) 대조로 PID 재사용 오인을 막고, 정지/실패/완료를 구분합니다. 로그는 `$ORCHESTRATION_META/.mentis-jobs/{잡id}/`.
  - ⚠️ 헤드리스 claude를 `--permission-mode bypassPermissions`로 실행합니다. 로컬 신뢰 환경에서만 쓰세요(대시보드에 인증 계층 없음).

## 설정

경로는 go-dobby와 동일한 규약으로 해석합니다(환경변수 → `~/.config/go-dobby/config.env` → 기본값):

- `ORCHESTRATION_META_PATH` (선택) — 메타 루트. 없으면 `$ORCHESTRATION_WORKSPACE/meta`.
- `ORCHESTRATION_WORKSPACE` — 작업 루트(기본 `~/work/dobby-workspace`).

> **v1(work-dobby)과 완전 분리**: go-dobby 스킬과 이 대시보드는 **`~/.config/go-dobby/config.env`**와 **`ORCHESTRATION_*`** 변수를 쓰고, v1(work-dobby)은 `~/.config/work-dobby/config.env`와 `DOBBY_*` 변수를 씁니다. 설정 파일과 변수 이름이 모두 달라 한 세션에서 섞여도 충돌하지 않습니다. 기존 v1 설정을 이어 쓰려면 접두사까지 바꿔 복사하세요:
>
> ```bash
> mkdir -p ~/.config/go-dobby
> sed 's/DOBBY_/ORCHESTRATION_/g' ~/.config/work-dobby/config.env > ~/.config/go-dobby/config.env
> # 이후 ORCHESTRATION_WORKSPACE / ORCHESTRATION_META_PATH 를 v2 전용 경로로 조정
> ```

## 설치 & 실행

```bash
pnpm install
pnpm dev             # http://localhost:7253
```

```bash
pnpm build
pnpm start           # http://localhost:7253
pnpm build:start     # 빌드 후 곧바로 실행(한 번에)
```

## 데모 (목업 데이터)

실제 `$ORCHESTRATION_META`를 건드리지 않고, 격리된 `./.demo-meta`에 예시 오더를 심어 실행합니다.

```bash
pnpm demo            # .demo-meta에 fixture 생성 후 ORCHESTRATION_META_PATH로 가리켜 dev 실행
pnpm demo:seed       # fixture만 생성
pnpm demo:clean      # .demo-meta 삭제
```

- 데모 데이터: K=1 code(종료)·K≥2(리뷰중, 변경 diff)·비소스(TASK)·최소(착수) 오더 + 잡 로그 예시. 모든 화면을 둘러볼 수 있습니다.
- `pnpm dev`는 **실제** `$ORCHESTRATION_META`를 읽으므로 데모 데이터가 섞이지 않습니다. (`.demo-meta`는 git 무시)

## 요구 사항

- Node.js 18.18 이상

# Mentis Dashboard v2 (go-dobby)

`go-dobby` 플러그인이 `$DOBBY_META/{키}/` 아래에 쌓는 **오더(이슈/작업) 메타 파일**을 읽어, 진행 상황을 보기 좋게 보여주는 로컬 대시보드입니다.

- Next.js 14 (App Router) · React 18 · TypeScript
- UI: Ant Design v6 · 마크다운: react-markdown + remark-gfm
- 데이터: 서버에서 파일시스템을 직접 읽음 (DB·API 불필요, 읽기 전용)

> v1(`mentis-dashboard`)은 work-dobby의 `.issue-start/.issue-test/.issue-end/.agent-start` 분리 폴더를 읽습니다.
> v2는 go-dobby의 **이슈당 폴더 1개 + 단일 status.md 인덱스** 모델을 읽습니다. 설계: [`docs/v2-design.md`](docs/v2-design.md).

## 무엇을 읽나

모든 작업은 `dobby-order` 하나로 시작하며, 오더 = `$DOBBY_META/{키}/` 한 폴더입니다. 대시보드는 이를 읽기만 합니다(수정하지 않음).

```
$DOBBY_META/{키}/                # 키 = FE1-1187 (이슈) 또는 TASK-{slug} (문서 전용)
├─ status.md            # ★ 단일 진행 인덱스: 현재 단계·팬아웃 K·에이전트·단계별 진행·테스트 이력·워크트리·해결
├─ analysis.md          # 착수·분석·수정 설계 (dobby-start)
├─ implementation.md    # 구현 요약 + 리뷰 (dobby-impl, work-type=code)
├─ produce.md           # 산출 요약 + 리뷰 (dobby-produce, work-type=비소스)
├─ test-runs/{시각}/result.md    # 검증 회차 (dobby-test, 덮어쓰지 않음)
├─ summary.md           # 종료 서머리 (dobby-end)
└─ (K≥2) orchestration.md · agents/ · reviews/round-n/ · agent-logs.json
```

## 화면

| 경로 | 설명 |
|------|------|
| `/` | 허브. 오더 지표(단계별 분포·오늘 갱신) + 진입 카드 |
| `/orders` | 오더 목록(키·타입·work-type·단계·팬아웃 K·통과율·갱신) + **실행 패널**(dobby-order 실행·진행 로그) |
| `/orders/[key]` | 오더 상세 — **단일 라우트 + 탭**: 개요 / 분석 / 구현·산출 / 검증(code) / 에이전트(K≥2) / 변경(K≥2) / 종료 / 실행 |
| `/agents` | 도비 에이전트 소개 |
| `/api/orders` | 잡 실행/정지/재개/보관·상태 조회 API (헤드리스 claude spawn) |

- **단독/오케스트레이션 통합**: K=1(단일)과 K≥2(다중)는 같은 오더이며, 팬아웃 K는 속성입니다.
- **탭 딥링크**: `/orders/{키}?tab=changes` 처럼 탭이 URL과 동기화됩니다.
- 모든 페이지는 **30초마다 자동 갱신**(서버 데이터만 재로딩)됩니다. `[key]`는 키 형식을 검증해 존재하지 않으면 404(경로 탈출 방지).
- **잡 실행**: 이슈 키로 `/dobby-order`를 백그라운드(detached) `claude`로 띄우고 stream-json 로그를 실시간 표시합니다. 실행 중 프로세스는 시그널 확인 + 명령어(`ps`) 대조로 PID 재사용 오인을 막고, 정지/실패/완료를 구분합니다. 로그는 `$DOBBY_META/.mentis-jobs/{키}/`.
  - ⚠️ 헤드리스 claude를 `--permission-mode bypassPermissions`로 실행합니다. 로컬 신뢰 환경에서만 쓰세요(대시보드에 인증 계층 없음).

## 설정

경로는 go-dobby와 동일한 규약으로 해석합니다(환경변수 → `~/.config/work-dobby/config.env` → 기본값):

- `DOBBY_META_PATH` (선택) — 메타 루트. 없으면 `$DOBBY_WORKSPACE/meta`.
- `DOBBY_WORKSPACE` — 작업 루트(기본 `~/work/dobby-workspace`).

## 설치 & 실행

```bash
npm install
npm run dev          # http://localhost:7253
```

```bash
npm run build
npm run start        # http://localhost:7253
```

## 요구 사항

- Node.js 18.18 이상

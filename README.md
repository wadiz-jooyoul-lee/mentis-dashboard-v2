# Mentis Dashboard

`~/work/subtree/` 하위에 쌓이는 **이슈 생명주기 메타 파일**(issue-start / issue-test / issue-end 스킬 산출물)을 읽어, 이슈별 진행 상황을 보기 좋게 보여주는 로컬 대시보드입니다.

- Next.js 14 (App Router) · React 18 · TypeScript
- UI: Ant Design v6
- 마크다운 렌더: react-markdown + remark-gfm
- 데이터: 서버에서 파일시스템을 직접 읽음 (DB·API 불필요)

## 무엇을 읽나

세 스킬이 이슈 키(`FE-1234`, `QA-22370` 등)를 공유하며 아래 폴더에 기록하고, 대시보드는 이를 읽기만 합니다(수정하지 않음).

```
~/work/subtree/
├─ .issue-start/{이슈키}/status.md          # 착수 → 분석완료 → 해결됨
├─ .issue-test/{이슈키}/
│   ├─ status.md                            # 진행 상태(테스트중/완료/…)
│   ├─ test-plan/{이슈키}-test-plan.md
│   └─ results/{YYYYMMDD-HHMMSS}/           # 실행 회차별 결과(덮어쓰지 않음)
│       └─ {이슈키}-test-result.md
└─ .issue-end/{이슈키}/summary.md           # 최종 상태 + 워크트리 처리(제거/유지)
```

## 화면

| 경로 | 설명 |
|------|------|
| `/` | 메인 허브. 섹션 카드 + 섹션별 요약 지표 |
| `/issue-start` | 이슈 착수 목록 · 상세(워크트리/브랜치, 분석 요약) |
| `/issue-test` | 이슈 테스트 목록(통과율·환경·상태 미리보기) · 상세 |
| `/issue-test/[key]` | 결과 리포트(종합 판정·시나리오 표·근거). **실행 회차 선택**(최신 우선, 이전 회차 조회) |
| `/issue-end` | 이슈 종료 목록 · 상세(최종 상태, 워크트리 제거/유지) |
| `/lifecycle` | 이슈별 `착수 → 테스트 → 종료`를 한 줄로 |

- 모든 페이지는 **30초마다 자동 갱신**됩니다(전체 리로드 없이 서버 데이터만 다시 읽음). 스킬이 `status.md`를 갱신하면 대시보드가 자동으로 진행 상황을 반영합니다.
- 이슈 키는 Jira(`https://wadiz.atlassian.net/browse/{키}`)로 바로 연결됩니다.

## 요구 사항

- Node.js 18.18 이상

## 설치 & 실행

```bash
npm install
npm run dev          # http://localhost:7153
```

프로덕션 빌드:

```bash
npm run build
npm run start        # http://localhost:7153
```

## 설정

읽어올 데이터 폴더는 환경변수 `ISSUE_TEST_DIR`로 바꿀 수 있습니다. 기본값은 `~/work/subtree/.issue-test`이며, `.issue-start`·`.issue-end`는 그 상위 폴더(`~/work/subtree`) 기준으로 자동 계산됩니다.

```bash
ISSUE_TEST_DIR=/path/to/.issue-test npm run dev
```

- `ISSUE_START_DIR` / `ISSUE_END_DIR`로 각 폴더를 개별 지정할 수도 있습니다.

## 구조

```
src/
├─ app/                     # 라우트(App Router). 각 page.tsx는 서버에서 파일을 읽어 클라이언트 컴포넌트에 전달
├─ components/              # antd 기반 화면 컴포넌트 (목록/상세/허브/자동갱신)
└─ lib/
    ├─ issues.ts            # .issue-test 리더(회차·미리보기·진행상태)
    ├─ lifecycle.ts         # .issue-start/.issue-end 리더 + 생명주기·허브 지표 집계
    ├─ md.ts                # 마크다운 공용 파싱 헬퍼(표/필드 추출)
    ├─ parseReport.ts       # 테스트 결과 md 파서
    ├─ parseStatus.ts       # 테스트 진행 상태(status.md) 파서
    ├─ parseStart.ts        # issue-start status.md 파서
    ├─ parseEnd.ts          # issue-end summary.md 파서
    ├─ sections.ts          # 허브 섹션 레지스트리(새 섹션 추가 지점)
    └─ jira.ts              # Jira URL 헬퍼
```

새 대시보드 섹션을 추가하려면 `src/lib/sections.ts`에 항목을 넣고 `src/app/{path}/` 라우트를 만들면 됩니다.

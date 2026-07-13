"use client";

import Link from "next/link";
import { Breadcrumb, Typography } from "antd";
import MarkdownDoc from "@/components/MarkdownDoc";

const { Title, Paragraph } = Typography;

const DOC = `# 대시보드 구성도 — 스킬 · 파일 · 화면 관계

go-dobby 스킬이 \`$ORCHESTRATION_META/{키}/\`에 남기는 **메타 파일**을, 대시보드의 각 **화면**이 어떻게 읽어 보여주는지 한눈에 정리한 문서입니다.

## 실행 순서 (go-dobby 스킬)

하나의 오더가 진행되며 스킬이 이 순서로 실행됩니다. \`dobby-order\`가 전체를 지휘하며 내부에서 \`dobby-start\`(P1)·\`dobby-impl\`/\`dobby-produce\`(P4)를 호출합니다.

\`\`\`mermaid
flowchart TB
  O1["1. dobby-order — 진입점·오케스트레이터"] --> O2["2. dobby-start — 착수·분석 (P1)"]
  O2 --> O3["3. dobby-impl / 4. dobby-produce — 구현·비소스 산출 (P4)"]
  O3 --> O4["5. dobby-test — 검증"]
  O4 --> O5["6. dobby-resolve — 해결 표시"]
  O5 --> O6["7. dobby-end — 워크트리 정리"]
  O6 --> O7["8. dobby-explain — 구현 내용 생성"]
\`\`\`

## 흐름: 스킬 → 메타 파일 → 화면

아래는 각 스킬(위 번호와 동일)이 만드는 파일과, 그 파일을 읽는 화면의 관계입니다.

\`\`\`mermaid
flowchart LR
  subgraph S["go-dobby 스킬 (실행 순서)"]
    S1["1. dobby-order (진입점·오케스트레이터)"]
    S2["2. dobby-start (착수·분석 P1)"]
    S3["3. dobby-impl (구현 P4)"]
    S4["4. dobby-produce (비소스 산출 P4)"]
    S5["5. dobby-test (검증)"]
    S6["6. dobby-resolve (해결 표시)"]
    S7["7. dobby-end (워크트리 정리)"]
    S8["8. dobby-explain (구현 내용 생성)"]
  end
  subgraph F["메타 파일 ($ORCHESTRATION_META/키/)"]
    F1["status.md"]
    F4["orchestration.md"]
    F5["agents/*.md (계약)"]
    F6["reviews/round-*/*.md"]
    F7["agent-logs.json + 대화로그"]
    F2["analysis.md"]
    F3["implementation.md / produce.md"]
    F8["test-runs/시각/result.md"]
    F9["deliverables/"]
    F10["summary.md"]
    F11["explainer.md"]
    F12[".mentis-jobs/키/run.log"]
  end
  subgraph V["대시보드 화면"]
    V2["오케스트레이션 목록"]
    V3["관제 보드 [key]"]
    V4["변경 (changes)"]
    V5["구현 내용 (explain)"]
    V6["콘솔 (console)"]
  end

  S1 --> F4 & F5 & F6 & F7
  S2 --> F1 & F2
  S3 --> F3
  S4 --> F3 & F9
  S5 --> F8
  S6 --> F1
  S7 --> F10
  S8 --> F11

  F1 --> V2 & V3
  F2 --> V3
  F3 --> V3
  F4 --> V3
  F5 --> V3 & V4
  F6 --> V3
  F7 --> V4 & V6
  F8 --> V3
  F9 --> V3
  F10 --> V3
  F11 --> V5
  F12 --> V6
\`\`\`

## 화면별로 무엇을 보여주나

| 화면 | 읽는 파일 | 보여주는 내용 |
|---|---|---|
| **허브 (/)** | (목록 집계) | 개발/비개발 오더 수·진행중·리뷰중·완료 지표 |
| **오케스트레이션 목록** | \`status.md\` | 제목·현재 단계·work-type·상태 분포·진행률 (날짜별 폴딩) |
| **관제 보드 [key]** | \`orchestration.md\` | 에이전트 칸반·완료율·이벤트 타임라인·실행 모드 |
| | \`agents/*.md\` | 에이전트 계약(수정 허용 범위) |
| | \`reviews/round-*/*.md\` | 라운드별 리뷰 findings |
| | \`analysis.md\` / \`implementation.md\`·\`produce.md\` | 분석·구현/산출 섹션 |
| | \`test-runs/시각/result.md\` | 검증 리포트(회차·통과율) |
| | \`deliverables/\` · \`summary.md\` | 산출물·종료 서머리 |
| **변경 (changes)** | \`agent-logs.json\`+대화로그 | 에이전트별 수정 파일·커밋·diff (메타 파일 제외) |
| | \`agents/*.md\` | 로그 없을 때 계약·상태 |
| **구현 내용 (explain)** | \`explainer.md\` | 비전공자용 설명 + mermaid 흐름도 |
| **콘솔 (console)** | \`.mentis-jobs/키/run.log\` | 실시간(대시보드 실행 잡) |
| | 부모 세션 \`.jsonl\` · 서브 \`.output\` | 기록(오케스트레이터·서브에이전트) |

> 실행 콘솔의 "기록"은 클로드 코드 세션 전사(\`~/.claude/projects/…\`)를, "실시간"은 대시보드가 띄운 \`run.log\`를 읽습니다.
`;

export default function DataMapView() {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link href="/">홈</Link> }, { title: "구성도" }]}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        대시보드 구성도
      </Title>
      <Paragraph type="secondary">
        어떤 스킬이 만든 어떤 파일이 어떤 화면에 보이는지 정리한 참고 문서입니다.
      </Paragraph>
      <MarkdownDoc md={DOC} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { Breadcrumb, Typography } from "antd";
import MarkdownDoc from "@/components/MarkdownDoc";

const { Title, Paragraph } = Typography;

const DOC = `# 대시보드 구성도 — 오더 하나가 거치는 흐름

go-dobby 스킬이 오더 폴더(\`$ORCHESTRATION_META/{키}/\`)에 파일을 남기고, 대시보드 화면이 그 파일을 읽어 보여줍니다. **"어떤 스킬이 만든 무엇이, 어느 화면에 보이는지"** 를 정리했습니다.

## 한눈에 — 실행 순서

\`dobby-order\` 하나가 전체를 지휘하고, 그 안에서 착수 → 구현 → 검증 → 종료를 차례로 진행합니다.

\`\`\`mermaid
flowchart LR
  A["dobby-order<br/>진입·지휘"] --> B["dobby-start<br/>착수·분석"]
  B --> C["dobby-impl / dobby-produce<br/>구현 · 산출"]
  C --> D["dobby-test<br/>검증"]
  D --> E["dobby-resolve<br/>해결"]
  E --> F["dobby-end<br/>종료"]
  F --> G["dobby-explain<br/>구현 내용"]
\`\`\`

## ① 스킬 기준 — 만든 파일이 어디에 보이나

각 단계의 스킬이 만드는 파일과, 그 파일이 나타나는 화면입니다. (위 순서 그대로)

| 단계 | 스킬 | 만드는·갱신 파일 | 보이는 화면 |
|---|---|---|---|
| 진입·지휘 | \`dobby-order\` | \`orchestration.md\` · \`agents/*.md\` · \`reviews/round-*/*.md\` · \`agent-logs.json\` | 관제 보드 · 변경 · 콘솔 |
| 착수·분석 | \`dobby-start\` | \`status.md\` · \`analysis.md\` | 목록 · 관제 보드(분석) |
| 구현 | \`dobby-impl\` | \`implementation.md\` | 관제 보드(구현) |
| 산출(비소스) | \`dobby-produce\` | \`produce.md\` · \`deliverables/\` | 관제 보드(산출·산출물) |
| 검증 | \`dobby-test\` | \`test-runs/{시각}/result.md\` | 관제 보드(검증) |
| 해결 | \`dobby-resolve\` | \`status.md\`(해결 표시) | 목록·보드 상태 배지 |
| 종료 | \`dobby-end\` | \`summary.md\` · \`code-changes/\` | 관제 보드(종료) · 변경 |
| 구현 내용 | \`dobby-explain\` | \`explainer.md\` | 구현 내용 |

## ② 화면 기준 — 무슨 파일을 읽나

반대로, 각 화면이 어떤 파일을 읽어 무엇을 보여주는지입니다.

| 화면 | 읽는 파일 | 보여주는 내용 |
|---|---|---|
| **허브 (/)** | 목록 집계 | 개발/비개발 오더 수 · 진행중 · 리뷰중 · 완료 지표 |
| **오케스트레이션 목록** | \`status.md\` | 제목 · 현재 단계 · work-type · 상태 분포 · 진행률 |
| **관제 보드 [key]** | \`orchestration.md\` | 에이전트 칸반 · 완료율 · 이벤트 타임라인 · 실행 모드 |
| | \`agents/*.md\` | 에이전트 계약(수정 허용 범위) |
| | \`reviews/round-*/*.md\` | 라운드별 리뷰 findings |
| | \`analysis.md\` · \`implementation.md\`/\`produce.md\` | 분석 · 구현/산출 섹션 |
| | \`test-runs/{시각}/result.md\` | 검증 리포트(회차 · 통과율) |
| | \`deliverables/\` · \`summary.md\` | 산출물 · 종료 서머리 |
| **변경 (changes)** | \`agent-logs.json\` + 대화로그 | 에이전트별 수정 파일 · 커밋 · diff |
| **구현 내용 (explain)** | \`explainer.md\` | 비전공자용 설명 + 흐름도 |
| **콘솔 (console)** | \`.mentis-jobs/{키}/run.log\` (실시간) | 대시보드가 띄운 잡 진행 로그 |
| | 세션 전사 \`.jsonl\` (기록) | 오케스트레이터 · 서브에이전트 대화 기록 |

> 콘솔의 **"실시간"** 은 대시보드가 띄운 \`run.log\`를, **"기록"** 은 Claude 세션 전사(\`~/.claude/projects/…\`)를 읽습니다.
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

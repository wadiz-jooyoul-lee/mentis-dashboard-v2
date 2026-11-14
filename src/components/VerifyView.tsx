"use client";

import { Alert, Card, Typography } from "antd";
import OrderHeader from "@/components/OrderHeader";
import MarkdownCards from "@/components/MarkdownCards";
import IssueReport from "@/components/IssueReport";
import TestSummaryView from "@/components/TestSummaryView";
import TestPlanView from "@/components/TestPlanView";
import type { TestSummary } from "@/lib/testSummary";
import type { ReportRun } from "@/lib/issues";
import type { TestPlan } from "@/lib/testPlan";

const { Title, Text } = Typography;

/** 검증 탭: 테스트 회차(test-runs) + 확인 가이드(수동 TC). 보드 하단에 있던 걸 별도 페이지로. */
export default function VerifyView({
  epicKey,
  title = null,
  mode,
  worktreeRemoved,
  resolved = false,
  hasJira,
  hasDesign = false,
  hasQa = false,
  orderKind = null,
  runs,
  summary = null,
  testGuideMd,
  testPlan = null,
}: {
  epicKey: string;
  title?: string | null;
  mode: string | null;
  worktreeRemoved: boolean;
  resolved?: boolean;
  hasJira: boolean;
  hasDesign?: boolean;
  hasQa?: boolean;
  orderKind?: "development" | "deliverable" | "summary" | null;
  runs: ReportRun[];
  /** 모든 회차를 모은 요약. 회차가 없으면 null. */
  summary?: TestSummary | null;
  testGuideMd: string | null;
  /** 설계 때 만든 테스트 계획(test-plan.md). 없으면 null. */
  testPlan?: TestPlan | null;
}) {
  const skipReason = testPlan?.skipReason ?? null;
  const planHasBody = !!testPlan && (testPlan.sections.length > 0 || testPlan.scenarios.length > 0);
  return (
    <div>
      <OrderHeader
        epicKey={epicKey}
        title={title}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        resolved={resolved}
        hasJira={hasJira}
        hasDesign={hasDesign}
        hasQa={hasQa}
        orderKind={orderKind}
      />
      <div style={{ marginTop: 16 }}>
        <Title level={4}>검증</Title>
        {/* 테스트 계획 제목 아래의 "검증: 필요 없음 — 이유" 줄. 이 오더는 배포 환경에서 확인할 것이 없다. */}
        {skipReason !== null && (
          <Alert
            data-verify-skip
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title={`검증: 필요 없음${skipReason ? ` — ${skipReason}` : ""}`}
            description="이 오더는 배포 환경에서 화면을 확인하지 않습니다. 테스트 회차를 만들지 않고 넘어갑니다."
          />
        )}
        {testPlan && planHasBody && <TestPlanView plan={testPlan} defaultOpen={runs.length === 0} />}
        {runs.length > 0 ? (
          <IssueReport issueKey={epicKey} runs={runs} summary={summary} embedded />
        ) : skipReason !== null ? null : (
          <Card size="small">
            <Text type="secondary">
              아직 테스트 회차가 없습니다 — code 오더에서 <Text code>dobby-test</Text> 실행 시
              <Text code> test-runs/</Text>에 회차가 쌓이고 여기 리포트가 표시됩니다.
            </Text>
          </Card>
        )}
      </div>
      <MarkdownCards
        title="확인 가이드 (수동 TC)"
        subtitle="사용자가 직접 사이드이펙트를 확인하는 방법입니다. 화면·절차·기대 결과 순으로 따라 하세요."
        md={testGuideMd}
      />
    </div>
  );
}

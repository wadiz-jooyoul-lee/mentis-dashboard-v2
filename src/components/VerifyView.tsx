"use client";

import { Card, Typography } from "antd";
import OrderHeader from "@/components/OrderHeader";
import MarkdownCards from "@/components/MarkdownCards";
import IssueReport from "@/components/IssueReport";
import type { ReportRun } from "@/lib/issues";

const { Title, Text } = Typography;

/** 검증 탭: 테스트 회차(test-runs) + 확인 가이드(수동 TC). 보드 하단에 있던 걸 별도 페이지로. */
export default function VerifyView({
  epicKey,
  title = null,
  mode,
  worktreeRemoved,
  hasJira,
  runs,
  testGuideMd,
}: {
  epicKey: string;
  title?: string | null;
  mode: string | null;
  worktreeRemoved: boolean;
  hasJira: boolean;
  runs: ReportRun[];
  testGuideMd: string | null;
}) {
  return (
    <div>
      <OrderHeader
        epicKey={epicKey}
        title={title}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        hasJira={hasJira}
      />
      <div style={{ marginTop: 16 }}>
        <Title level={4}>검증</Title>
        {runs.length > 0 ? (
          <IssueReport issueKey={epicKey} runs={runs} embedded />
        ) : (
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

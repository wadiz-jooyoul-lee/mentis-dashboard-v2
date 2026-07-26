"use client";

import { Typography, Space, Tabs } from "antd";
import JobConsole from "@/components/JobConsole";
import OrderHeader from "@/components/OrderHeader";

const { Paragraph } = Typography;

/**
 * 오더 콘솔 화면. 실시간과 지난 기록을 각각 별도 탭으로 제공한다:
 *  - 실시간: 대시보드가 띄운 run.log (제어 가능)
 *  - 기록 · 오케스트레이터: 부모 세션 .jsonl (클로드 히스토리, 읽기전용)
 *  - 기록 · {서브}: 각 서브에이전트 .output (읽기전용)
 * destroyInactiveTabPane 로 활성 탭만 마운트 → 열어 둔 콘솔 하나만 폴링한다.
 * (antd는 클라이언트 컴포넌트에서만 사용 — 서버 컴포넌트 RSC 매니페스트 이슈 회피)
 */
export default function ConsoleTabs({
  orderKey,
  title = null,
  agents,
  height = 480,
  mode = null,
  worktreeRemoved = false,
  hasJira = false,
}: {
  orderKey: string;
  title?: string | null;
  agents: { id: string; label: string }[];
  height?: number;
  mode?: string | null;
  worktreeRemoved?: boolean;
  hasJira?: boolean;
}) {
  const items = [
    {
      key: "__live__",
      label: "실시간",
      children: <JobConsole orderKey={orderKey} height={height} />,
    },
    {
      key: "__session__",
      label: "기록 · 오케스트레이터",
      children: <JobConsole orderKey={orderKey} source="session" height={height} />,
    },
    ...agents.map((a) => ({
      key: a.id,
      label: `기록 · ${a.label}`,
      children: <JobConsole orderKey={orderKey} agent={a.id} height={height} />,
    })),
  ];

  return (
    <div>
      <OrderHeader
        epicKey={orderKey}
        title={title}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        hasJira={hasJira}
      />
      <Space direction="vertical" size={16} style={{ width: "100%", marginTop: 12 }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
        <b>실시간</b>은 대시보드가 띄운 <code>dobby-order</code> 진행(정지·이어서 가능),
        <b> 기록</b>은 클로드 히스토리(세션·서브에이전트)를 재생/추적합니다(읽기 전용).
          진행 중이면 자동 추적, 끝났으면 재생으로 표시됩니다.
        </Paragraph>
        <Tabs items={items} defaultActiveKey="__live__" destroyInactiveTabPane />
      </Space>
    </div>
  );
}

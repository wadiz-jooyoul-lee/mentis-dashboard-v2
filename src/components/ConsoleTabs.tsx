"use client";

import { useEffect, useState } from "react";
import { Typography, Space, Select, Badge } from "antd";
import JobConsole from "@/components/JobConsole";
import OrderHeader from "@/components/OrderHeader";

const { Paragraph } = Typography;

/**
 * 오더 콘솔 화면. 대시보드 실행 로그와 지난 기록을 드롭다운에서 골라 본다:
 *  - 대시보드 실행 로그: 대시보드가 띄운 run.log (제어 가능)
 *  - 기록 · 오케스트레이터: 부모 세션 .jsonl (클로드 히스토리, 읽기전용)
 *  - 기록 · {서브}: 각 서브에이전트 .output (읽기전용)
 * 고른 콘솔 하나만 렌더 → 열어 둔 콘솔 하나만 폴링한다.
 * 목록에는 지금 작업 중인 콘솔에 "진행 중" 표시를 단다(5초마다 갱신).
 * 주소의 ?agent={콘솔id} 로 처음 고를 콘솔을 정한다(보드 카드의 "콘솔 보기").
 * (antd는 클라이언트 컴포넌트에서만 사용 — 서버 컴포넌트 RSC 매니페스트 이슈 회피)
 */
export default function ConsoleTabs({
  orderKey,
  title = null,
  agents,
  height = 480,
  mode = null,
  worktreeRemoved = false,
  resolved = false,
  hasJira = false,
  hasDesign = false,
  hasQa = false,
  orderKind = null,
  initialSelected = null,
}: {
  orderKey: string;
  title?: string | null;
  agents: { id: string; label: string }[];
  height?: number;
  mode?: string | null;
  worktreeRemoved?: boolean;
  resolved?: boolean;
  hasJira?: boolean;
  hasDesign?: boolean;
  hasQa?: boolean;
  orderKind?: "development" | "deliverable" | "summary" | null;
  /** 처음 고를 콘솔 id. 목록에 없으면 대시보드 실행 로그. */
  initialSelected?: string | null;
}) {
  const consoles = [
    { key: "__live__", group: "대시보드 실행 로그", name: "대시보드 실행 로그" },
    { key: "__session__", group: "기록", name: "오케스트레이터" },
    ...agents.map((a) => ({ key: a.id, group: "기록", name: a.label })),
  ];
  const [selected, setSelected] = useState(initialSelected ?? "__live__");
  const [live, setLive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/orders?consoleLive=${encodeURIComponent(orderKey)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && d?.live && setLive(d.live))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [orderKey]);

  const option = (c: (typeof consoles)[number]) => ({
    value: c.key,
    label: live[c.key] ? (
      <Space size={6}>
        <Badge status="processing" />
        <b>{c.name}</b>
        <Typography.Text type="success">진행 중</Typography.Text>
      </Space>
    ) : (
      c.name
    ),
  });
  const runningCount = consoles.filter((c) => live[c.key]).length;
  const sel = consoles.find((c) => c.key === selected) ?? consoles[0];
  const agentId = sel.key === "__live__" || sel.key === "__session__" ? undefined : sel.key;

  return (
    <div>
      <OrderHeader
        epicKey={orderKey}
        title={title}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        resolved={resolved}
        hasJira={hasJira}
        hasDesign={hasDesign}
        hasQa={hasQa}
        orderKind={orderKind}
      />
      <Space orientation="vertical" size={16} style={{ width: "100%", marginTop: 12 }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          <b>대시보드 실행 로그</b>는 대시보드 버튼으로 띄운 실행(<code>dobby-order</code>, <code>/do</code> 자동 실행,
          이어서 진행)의 로그입니다. 끝난 뒤에도 마지막 로그를 보여 주며, 정지·이어서가 가능합니다.
          <b> 기록</b>은 클로드 히스토리(세션·서브에이전트)를 재생/추적합니다(읽기 전용).
          진행 중이면 자동 추적, 끝났으면 재생으로 표시됩니다.
        </Paragraph>
        <Space size={12} wrap>
          <Select
            value={sel.key}
            onChange={setSelected}
            style={{ minWidth: 360 }}
            showSearch={{ optionFilterProp: "title" }}
            options={["대시보드 실행 로그", "기록"].map((g) => ({
              label: g,
              title: g,
              options: consoles.filter((c) => c.group === g).map((c) => ({ ...option(c), title: c.name })),
            }))}
          />
          {runningCount > 0 ? (
            <Badge status="processing" text={`진행 중인 콘솔 ${runningCount}개`} />
          ) : (
            <Typography.Text type="secondary">진행 중인 콘솔 없음</Typography.Text>
          )}
        </Space>
        <JobConsole
          key={sel.key}
          orderKey={orderKey}
          source={sel.key === "__session__" ? "session" : undefined}
          agent={agentId}
          height={height}
          liveHint={!!live[sel.key]}
        />
      </Space>
    </div>
  );
}

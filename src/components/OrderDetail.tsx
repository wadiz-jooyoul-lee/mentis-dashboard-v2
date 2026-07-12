"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Breadcrumb,
  Typography,
  Space,
  Tag,
  Badge,
  Button,
  Tabs,
  Card,
  Empty,
  Descriptions,
  Table,
  Steps,
  Alert,
} from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { jiraUrl } from "@/lib/jira";
import IssueReport from "@/components/IssueReport";
import OrchestrationBoard from "@/components/OrchestrationBoard";
import OrchestrationChanges from "@/components/OrchestrationChanges";
import JobConsole from "@/components/JobConsole";
import { PHASE_ORDER, phaseBadge, type PhaseKey } from "@/lib/parseOrderStatus";
import type { OrderDetail as Detail } from "@/lib/orders";
import type { JobStatus } from "@/lib/jobs";
import "./markdown.css";

const { Title, Text, Paragraph } = Typography;

const WORKTYPE_TAG: Record<string, { color: string; label: string }> = {
  code: { color: "geekblue", label: "code" },
  nonsource: { color: "purple", label: "비소스" },
};

function Md({ children }: { children: string | null }) {
  if (!children || !children.trim()) return <Empty description="내용 없음" />;
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/** 착수→…→종료 진행 표시. */
function PhaseTimeline({ phase }: { phase: PhaseKey }) {
  const idx = PHASE_ORDER.indexOf(phase);
  return (
    <Steps
      size="small"
      current={idx < 0 ? 0 : idx}
      status={phase === "unknown" ? "wait" : "process"}
      items={PHASE_ORDER.map((p) => ({ title: p }))}
      responsive
    />
  );
}

export default function OrderDetail({
  order,
  jobStatus,
}: {
  order: Detail;
  jobStatus?: JobStatus;
}) {
  const { status } = order;
  const [active, setActive] = useState("overview");

  // 딥링크: ?tab=changes 등 초기 탭을 URL에서 읽는다(클라이언트 전용).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setActive(t);
  }, []);

  const onTab = (key: string) => {
    setActive(key);
    const url = new URL(window.location.href);
    if (key === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url.toString());
  };

  const isNonsource = order.workType === "nonsource";
  const hasEpic = !!order.epic;
  const hasChanges = (order.epic?.agentWorks?.length ?? 0) > 0;

  // ── 개요 탭 ──
  const progressCols: ColumnsType<(typeof status.progress)[number]> = [
    { title: "단계", dataIndex: "phase" },
    { title: "스킬", dataIndex: "skill", render: (v: string) => (v ? <Text code>{v}</Text> : "—") },
    { title: "상태", dataIndex: "state" },
    { title: "산출물", dataIndex: "artifact", render: (v: string) => (v ? <Text code>{v}</Text> : "—") },
    { title: "갱신", dataIndex: "updatedAt", render: (v: string) => v || "—" },
  ];
  const worktreeCols: ColumnsType<(typeof status.worktrees)[number]> = [
    { title: "repo", dataIndex: "repo" },
    { title: "브랜치", dataIndex: "branch", render: (v: string) => (v ? <Text code>{v}</Text> : "—") },
    { title: "경로", dataIndex: "path", render: (v: string) => (v ? <Text code>{v}</Text> : "—") },
  ];

  const overview = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <PhaseTimeline phase={status.phase} />
      </Card>

      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
        <Descriptions.Item label="키">{order.key}</Descriptions.Item>
        <Descriptions.Item label="타입">{status.meta.type ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="제목" span={2}>
          {status.meta.title ?? "—"}
        </Descriptions.Item>
        <Descriptions.Item label="담당 스킬">
          {status.skill ? <Text code>{status.skill}</Text> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="팬아웃 K">
          {status.k != null ? `K=${status.k}` : "—"}
          {status.k != null && (
            <Text type="secondary">
              {" "}
              ({status.k >= 2 ? `부모 브랜치 feature/${order.key}` : "부모 브랜치 없음"})
            </Text>
          )}
        </Descriptions.Item>
        {status.meta.docPath && (
          <Descriptions.Item label="문서" span={2}>
            <Text code>{status.meta.docPath}</Text>
          </Descriptions.Item>
        )}
      </Descriptions>

      {status.progress.length > 0 && (
        <Card size="small" title="단계별 진행">
          <Table
            rowKey={(r) => r.phase + r.skill}
            size="small"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={status.progress}
            columns={progressCols}
          />
        </Card>
      )}

      {status.worktrees.length > 0 && (
        <Card size="small" title="워크트리 / 브랜치">
          <Table
            rowKey={(r) => r.repo + r.path}
            size="small"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={status.worktrees}
            columns={worktreeCols}
          />
        </Card>
      )}

      {status.resolution && (
        <Alert
          type="success"
          showIcon
          message="해결됨"
          description={
            <Space direction="vertical" size={2}>
              {status.resolution.at && <span>처리 일시: {status.resolution.at}</span>}
              {status.resolution.evidence && <span>근거: {status.resolution.evidence}</span>}
              {status.resolution.note && <span>비고: {status.resolution.note}</span>}
            </Space>
          }
        />
      )}
    </Space>
  );

  // ── 탭 구성 ──
  const items = [
    { key: "overview", label: "개요", children: overview },
    { key: "analysis", label: "분석", children: <Md>{order.analysisMd}</Md> },
    {
      key: "impl",
      label: isNonsource ? "산출" : "구현",
      children: <Md>{isNonsource ? order.produceMd : order.implementationMd}</Md>,
    },
    ...(!isNonsource
      ? [
          {
            key: "test",
            label: `검증${order.runs.length ? ` (${order.runs.length})` : ""}`,
            children: order.runs.length ? (
              <IssueReport issueKey={order.key} runs={order.runs} embedded />
            ) : (
              <Empty description="테스트 회차 없음 — dobby-test 실행 시 생성됩니다." />
            ),
          },
        ]
      : []),
    ...(hasEpic
      ? [
          {
            key: "agents",
            label: "에이전트",
            children: <OrchestrationBoard epicKey={order.key} epic={order.epic} embedded />,
          },
        ]
      : []),
    ...(hasChanges
      ? [
          {
            key: "changes",
            label: "변경",
            children: <OrchestrationChanges epicKey={order.key} epic={order.epic} embedded />,
          },
        ]
      : []),
    ...(order.summaryMd
      ? [{ key: "summary", label: "종료", children: <Md>{order.summaryMd}</Md> }]
      : []),
    {
      key: "run",
      label: jobStatus && jobStatus.state === "running" ? "실행 ●" : "실행",
      children: <JobConsole orderKey={order.key} initial={jobStatus} height={380} />,
    },
  ];

  const wt = order.workType ? WORKTYPE_TAG[order.workType] : null;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/orders">오더</Link> },
          { title: order.key },
        ]}
      />
      <Space align="center" size={12} wrap>
        <Title level={3} style={{ margin: 0 }}>
          {order.key}
        </Title>
        <Badge status={phaseBadge(status.phase)} text={status.phaseRaw ?? status.phase} />
        {status.k != null && <Tag color={status.k >= 2 ? "blue" : "default"}>K={status.k}</Tag>}
        {wt && <Tag color={wt.color}>{wt.label}</Tag>}
        {order.kind === "task" && <Tag>문서</Tag>}
        {order.jira && (
          <Button type="link" icon={<LinkOutlined />} href={order.jira} target="_blank">
            Jira에서 열기
          </Button>
        )}
      </Space>
      {status.meta.title && (
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {status.meta.title}
        </Paragraph>
      )}
      <Tabs activeKey={active} onChange={onTab} items={items} />
    </Space>
  );
}

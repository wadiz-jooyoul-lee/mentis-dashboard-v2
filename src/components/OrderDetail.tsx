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
  Drawer,
} from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { jiraUrl } from "@/lib/jira";
import IssueReport from "@/components/IssueReport";
import OrchestrationBoard from "@/components/OrchestrationBoard";
import AgentWorkView from "@/components/AgentWorkView";
import JobConsole from "@/components/JobConsole";
import { PHASE_ORDER, phaseBadge, phaseText, type PhaseKey } from "@/lib/parseOrderStatus";
import type { AgentRow } from "@/lib/parseOrchestration";
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
  const [drawer, setDrawer] = useState<{ slug?: string; agent: AgentRow } | null>(null);

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

  // Drawer에 띄울 에이전트 작업 내역(slug로 매칭) + 계약 폴백
  const drawerWork = drawer?.slug
    ? order.epic?.agentWorks.find((w) => w.slug === drawer.slug) ?? null
    : null;
  const drawerContract = drawer?.slug
    ? order.epic?.contracts.find((c) => c.slug === drawer.slug) ?? null
    : null;

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
        {status.phaseRaw && status.phaseRaw.trim().length > 10 && (
          <Paragraph type="secondary" style={{ margin: "12px 0 0" }}>
            현재 단계: {status.phaseRaw}
          </Paragraph>
        )}
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

      {/* 에이전트 상태 칸반(구 '에이전트' 탭 내용) — 카드 클릭 시 Drawer로 작업 내역 */}
      {hasEpic && (
        <OrchestrationBoard
          epicKey={order.key}
          epic={order.epic}
          embedded
          onAgentClick={(p) => setDrawer(p)}
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
      children: isNonsource ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Md>{order.produceMd}</Md>
          {order.deliverables.map((d) => (
            <Card key={d.name} size="small" title={<Text code>deliverables/{d.name}</Text>}>
              {d.kind === "md" ? (
                <Md>{d.content}</Md>
              ) : d.kind === "html" ? (
                <iframe
                  title={d.name}
                  srcDoc={d.content}
                  sandbox=""
                  style={{ width: "100%", height: 520, border: "1px solid #f0f0f0", borderRadius: 6 }}
                />
              ) : (
                <Text type="secondary">미리보기를 지원하지 않는 파일입니다.</Text>
              )}
            </Card>
          ))}
        </Space>
      ) : (
        <Md>{order.implementationMd}</Md>
      ),
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
        <Badge status={phaseBadge(status.phase)} text={phaseText(status.phaseRaw, status.phase)} />
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

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        width={Math.min(720, typeof window !== "undefined" ? window.innerWidth - 40 : 720)}
        title={
          drawer ? (
            <Space size={8} wrap>
              <Text strong>{drawer.agent.agent || drawer.slug || "에이전트"}</Text>
              {drawer.agent.state && <Tag>{drawer.agent.state}</Tag>}
              {drawer.agent.branch && drawer.agent.branch !== "-" && (
                <Text code style={{ fontSize: 12 }}>{drawer.agent.branch}</Text>
              )}
            </Space>
          ) : null
        }
      >
        {drawerWork ? (
          <AgentWorkView work={drawerWork} />
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Alert
              type="info"
              showIcon
              message="작업 로그 없음"
              description="이 에이전트의 대화 로그(agent-logs.json)가 아직 없어 수정 파일·diff를 표시할 수 없습니다. 상태·계약 정보만 표시합니다."
            />
            <Descriptions size="small" column={1} bordered>
              {drawer?.agent.issue && drawer.agent.issue !== "-" && (
                <Descriptions.Item label="이슈/작업">{drawer.agent.issue}</Descriptions.Item>
              )}
              <Descriptions.Item label="상태">{drawer?.agent.state || "—"}</Descriptions.Item>
              {drawer?.agent.round && <Descriptions.Item label="라운드">{drawer.agent.round}</Descriptions.Item>}
              {drawer?.agent.updatedAt && <Descriptions.Item label="갱신">{drawer.agent.updatedAt}</Descriptions.Item>}
            </Descriptions>
            {drawerContract && (
              <Card size="small" title="계약">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{drawerContract.raw}</ReactMarkdown>
                </div>
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </Space>
  );
}

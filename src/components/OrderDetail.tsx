"use client";

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
  Card,
  Empty,
  Descriptions,
  Table,
  Steps,
  Alert,
  Progress,
} from "antd";
import {
  LinkOutlined,
  PlayCircleOutlined,
  ExperimentOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import OrchestrationBoard from "@/components/OrchestrationBoard";
import { PHASE_ORDER, phaseBadge, phaseText, type PhaseKey } from "@/lib/parseOrderStatus";
import type { OrderDetail as Detail } from "@/lib/orders";
import "./markdown.css";

const { Title, Text, Paragraph } = Typography;

const WORKTYPE_TAG: Record<string, { color: string; label: string }> = {
  code: { color: "geekblue", label: "code" },
  nonsource: { color: "purple", label: "비소스" },
};

function Md({ children }: { children: string | null }) {
  if (!children || !children.trim()) return <Empty description="내용 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

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

function testPassRate(o: Detail): number | null {
  const t = o.latestTest;
  if (!t || t.pass == null) return null;
  const total = (t.pass ?? 0) + (t.fail ?? 0) + (t.skip ?? 0);
  return total > 0 ? Math.round(((t.pass ?? 0) / total) * 100) : null;
}

/** 오더 상세 — v1 스타일 단일 스크롤 페이지(탭 없음). 무거운 뷰는 서브 라우트. */
export default function OrderDetail({ order }: { order: Detail }) {
  const { status } = order;
  const isNonsource = order.workType === "nonsource";
  const hasEpic = !!order.epic;
  const hasChanges = (order.epic?.agentWorks?.length ?? 0) > 0;
  const wt = order.workType ? WORKTYPE_TAG[order.workType] : null;
  const rate = testPassRate(order);

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

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Breadcrumb items={[{ title: <Link href="/">홈</Link> }, { title: order.key }]} />

      {/* 헤더 */}
      <Space align="center" size={12} wrap>
        <Title level={3} style={{ margin: 0 }}>
          {order.key}
        </Title>
        <Badge status={phaseBadge(status.phase)} text={phaseText(status.phaseRaw, status.phase)} />
        {status.k != null && <Tag color={status.k >= 2 ? "blue" : "default"}>K={status.k}</Tag>}
        {wt && <Tag color={wt.color}>{wt.label}</Tag>}
        {order.kind === "task" && <Tag>문서</Tag>}
      </Space>
      {status.meta.title && (
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {status.meta.title}
        </Paragraph>
      )}
      <Space wrap>
        <Link href={`/orders/${order.key}/console`}>
          <Button icon={<PlayCircleOutlined />}>실행 콘솔</Button>
        </Link>
        {!isNonsource && (
          <Link href={`/orders/${order.key}/test`}>
            <Button icon={<ExperimentOutlined />}>검증 리포트{order.runs.length ? ` (${order.runs.length})` : ""}</Button>
          </Link>
        )}
        {hasChanges && (
          <Link href={`/orders/${order.key}/changes`}>
            <Button icon={<FileTextOutlined />}>변경 내역</Button>
          </Link>
        )}
        {order.jira && (
          <Button type="link" icon={<LinkOutlined />} href={order.jira} target="_blank">
            Jira에서 열기
          </Button>
        )}
      </Space>

      {/* 현재 단계 */}
      <Card size="small">
        <PhaseTimeline phase={status.phase} />
        {status.phaseRaw && status.phaseRaw.trim().length > 10 && (
          <Paragraph type="secondary" style={{ margin: "12px 0 0" }}>
            현재 단계: {status.phaseRaw}
          </Paragraph>
        )}
      </Card>

      {/* 이슈/작업 메타 */}
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
        <Descriptions.Item label="키">{order.key}</Descriptions.Item>
        <Descriptions.Item label="타입">{status.meta.type ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="담당 스킬">
          {status.skill ? <Text code>{status.skill}</Text> : "—"}
        </Descriptions.Item>
        <Descriptions.Item label="팬아웃 K">
          {status.k != null ? `K=${status.k}` : "—"}
          {status.k != null && (
            <Text type="secondary"> ({status.k >= 2 ? `부모 브랜치 feature/${order.key}` : "부모 브랜치 없음"})</Text>
          )}
        </Descriptions.Item>
        {status.meta.docPath && (
          <Descriptions.Item label="문서" span={2}>
            <Text code>{status.meta.docPath}</Text>
          </Descriptions.Item>
        )}
      </Descriptions>

      {/* 에이전트 상태 보드 — 카드 클릭 시 /changes 로 이동(v1) */}
      {hasEpic && <OrchestrationBoard epicKey={order.key} epic={order.epic} embedded />}

      {/* 단계별 진행 */}
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

      {/* 워크트리 */}
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

      {/* 분석 */}
      <Card size="small" title="분석 (analysis.md)">
        <Md>{order.analysisMd}</Md>
      </Card>

      {/* 구현 / 산출 */}
      <Card size="small" title={isNonsource ? "산출 (produce.md)" : "구현 (implementation.md)"}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Md>{isNonsource ? order.produceMd : order.implementationMd}</Md>
          {isNonsource &&
            order.deliverables.map((d) => (
              <Card key={d.name} size="small" type="inner" title={<Text code>deliverables/{d.name}</Text>}>
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
      </Card>

      {/* 검증 요약 (code) */}
      {!isNonsource && (
        <Card
          size="small"
          title="검증"
          extra={
            order.runs.length ? (
              <Link href={`/orders/${order.key}/test`}>리포트 보기 →</Link>
            ) : null
          }
        >
          {rate != null ? (
            <Space size={12} align="center">
              <Progress
                type="circle"
                size={44}
                percent={rate}
                status={order.latestTest?.fail ? "exception" : "success"}
              />
              <Text>
                최근 회차: 성공 {order.latestTest?.pass ?? 0} · 실패 {order.latestTest?.fail ?? 0} · skip{" "}
                {order.latestTest?.skip ?? 0}
              </Text>
            </Space>
          ) : (
            <Text type="secondary">테스트 회차 없음 — dobby-test 실행 시 생성됩니다.</Text>
          )}
        </Card>
      )}

      {/* 해결 / 종료 */}
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
      {order.summaryMd && (
        <Card size="small" title="종료 서머리 (summary.md)">
          <Md>{order.summaryMd}</Md>
        </Card>
      )}
    </Space>
  );
}

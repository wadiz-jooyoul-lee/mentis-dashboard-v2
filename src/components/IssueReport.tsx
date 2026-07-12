"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Breadcrumb,
  Card,
  Empty,
  Space,
  Typography,
  Button,
  Descriptions,
  Table,
  Tag,
  Row,
  Col,
  Statistic,
  Progress,
  Alert,
  Badge,
  Select,
} from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import {
  LinkOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  MinusCircleTwoTone,
  WarningTwoTone,
} from "@ant-design/icons";
import type { ReportRun } from "@/lib/issues";
import { jiraUrl } from "@/lib/jira";
import { stateBadge, type IssueStatus } from "@/lib/parseStatus";
import {
  parseReport,
  overallStatus,
  type Scenario,
  type Verdict,
} from "@/lib/parseReport";
import "./markdown.css";

const { Title, Text, Paragraph } = Typography;

const VERDICT_META: Record<
  Verdict,
  { color: string; label: string; icon: React.ReactNode }
> = {
  pass: {
    color: "success",
    label: "PASS",
    icon: <CheckCircleTwoTone twoToneColor="#52c41a" />,
  },
  fail: {
    color: "error",
    label: "FAIL",
    icon: <CloseCircleTwoTone twoToneColor="#ff4d4f" />,
  },
  skip: {
    color: "default",
    label: "SKIP",
    icon: <MinusCircleTwoTone twoToneColor="#8c8c8c" />,
  },
  warn: {
    color: "warning",
    label: "주의",
    icon: <WarningTwoTone twoToneColor="#faad14" />,
  },
  unknown: { color: "default", label: "-", icon: null },
};

function VerdictTag({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  return (
    <Tag color={m.color} icon={m.icon}>
      {m.label}
    </Tag>
  );
}

function ReportBody({ content }: { content: string }) {
  const { title, meta, scenarios, counts, restMarkdown } = parseReport(content);
  const overall = overallStatus(counts);
  const passRate =
    counts.total > 0 ? Math.round((counts.pass / counts.total) * 100) : 0;
  const hasEvidence = scenarios.some((s) => s.evidence);

  const columns = [
    { title: "#", dataIndex: "num", key: "num", width: 56 },
    {
      title: "페이지 / URL",
      dataIndex: "page",
      key: "page",
      render: (v: string) =>
        v ? <Text code style={{ whiteSpace: "normal" }}>{v}</Text> : "-",
    },
    { title: "확인 항목", dataIndex: "check", key: "check" },
    { title: "기대", dataIndex: "expected", key: "expected" },
    { title: "실제", dataIndex: "actual", key: "actual" },
    {
      title: "판정",
      dataIndex: "verdict",
      key: "verdict",
      width: 96,
      render: (v: Verdict) => <VerdictTag verdict={v} />,
    },
    ...(hasEvidence
      ? [{ title: "근거", dataIndex: "evidence", key: "evidence" }]
      : []),
  ];

  const failed = scenarios.filter((s) => s.verdict === "fail");

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* 종합 요약 */}
      <Card>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={6}>
            <Space direction="vertical" size={4}>
              <Text type="secondary">종합 판정</Text>
              <Tag
                color={overall.color}
                style={{ fontSize: 18, padding: "6px 16px", margin: 0 }}
              >
                {overall.label}
              </Tag>
            </Space>
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="전체" value={counts.total} suffix="건" />
          </Col>
          <Col xs={12} md={4}>
            <Statistic
              title="통과"
              value={counts.pass}
              valueStyle={{ color: "#52c41a" }}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic
              title="실패"
              value={counts.fail}
              valueStyle={{ color: "#ff4d4f" }}
            />
          </Col>
          <Col xs={12} md={2}>
            <Statistic title="스킵/주의" value={counts.skip + counts.warn} />
          </Col>
          <Col xs={24} md={4} style={{ textAlign: "center" }}>
            <Progress
              type="dashboard"
              percent={passRate}
              size={90}
              status={counts.fail > 0 ? "exception" : "success"}
            />
            <div>
              <Text type="secondary">통과율</Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 실패 요약 배너 */}
      {failed.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={`실패 ${failed.length}건`}
          description={
            <span>
              {failed
                .map((s) => `#${s.num} ${s.check || s.page}`)
                .join(" · ")}
            </span>
          }
        />
      )}

      {/* 메타 정보 */}
      {meta.length > 0 && (
        <Descriptions
          title="테스트 개요"
          bordered
          size="small"
          column={{ xs: 1, sm: 1, md: 2 }}
        >
          {meta.map((m) => (
            <Descriptions.Item key={m.label} label={m.label}>
              {m.value}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}

      {/* 시나리오 표 */}
      {scenarios.length > 0 && (
        <div>
          <Title level={4}>시나리오별 결과</Title>
          <Table<Scenario>
            rowKey={(r) => r.num || `${r.page}-${r.check}`}
            columns={columns}
            dataSource={scenarios}
            pagination={false}
            size="middle"
            scroll={{ x: "max-content" }}
            rowClassName={(r) =>
              r.verdict === "fail" ? "row-fail" : ""
            }
          />
        </div>
      )}

      {/* 나머지 상세 (변경요약·발견된 문제·근거 등) */}
      {restMarkdown && (
        <Card title="상세 내용">
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {restMarkdown}
            </ReactMarkdown>
          </div>
        </Card>
      )}

      {title && (
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          원본 제목: {title}
        </Paragraph>
      )}
    </Space>
  );
}

export default function IssueReport({
  issueKey,
  runs,
  status,
  embedded,
}: {
  issueKey: string;
  runs: ReportRun[];
  status?: IssueStatus | null;
  /** 오더 상세 탭 안에 임베드될 때 상단 브레드크럼/제목을 생략 */
  embedded?: boolean;
}) {
  const badge = status ? stateBadge(status.state) : null;
  const inProgress =
    status?.state === "테스트중" || status?.state === "분석중";

  // 최신(runs[0]) 우선 선택
  const [selectedId, setSelectedId] = useState(runs[0]?.id ?? "");
  const selected = runs.find((r) => r.id === selectedId) ?? runs[0] ?? null;

  return (
    <div>
      {!embedded && (
        <Breadcrumb
          items={[
            { title: <Link href="/">홈</Link> },
            { title: <Link href="/orders">오더</Link> },
            { title: issueKey },
          ]}
          style={{ marginBottom: 12 }}
        />
      )}
      <Space align="center" style={{ marginBottom: 8 }} size={12} wrap>
        <Title level={2} style={{ margin: 0 }}>
          {issueKey}
        </Title>
        {badge && (
          <Badge
            status={badge.status}
            text={
              inProgress && status?.total != null
                ? `${badge.text} (${status.done ?? 0}/${status.total})`
                : badge.text
            }
          />
        )}
        <Button
          type="link"
          icon={<LinkOutlined />}
          href={jiraUrl(issueKey)}
          target="_blank"
        >
          Jira에서 열기
        </Button>
      </Space>

      {selected ? (
        <>
          <Space
            align="center"
            size={12}
            wrap
            style={{ marginBottom: 12 }}
          >
            <Space size={6}>
              <HistoryOutlined />
              <Text type="secondary">실행 회차</Text>
            </Space>
            <Select
              value={selected.id}
              onChange={setSelectedId}
              style={{ minWidth: 260 }}
              options={runs.map((r, i) => ({
                value: r.id,
                label: `${r.label}${i === 0 ? " · 최신" : ""}`,
              }))}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              총 {runs.length}회 · 파일: {selected.file}
            </Text>
          </Space>
          <ReportBody key={selected.id} content={selected.content} />
        </>
      ) : (
        <Empty description="이 이슈에 대한 테스트 결과 md가 없습니다" />
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Tag, Typography, Space, Progress, Badge } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { IssueSummary } from "@/lib/issues";
import { jiraUrl } from "@/lib/jira";
import { stateBadge } from "@/lib/parseStatus";
import DateFoldedTable from "@/components/DateFoldedTable";

const { Title, Text } = Typography;

export default function IssueList({
  issues,
  sourceDir,
}: {
  issues: IssueSummary[];
  sourceDir: string;
}) {
  const router = useRouter();

  const columns = [
    {
      title: "이슈",
      dataIndex: "key",
      key: "key",
      render: (key: string) => (
        <Space size={8}>
          <Text strong>{key}</Text>
          <a
            href={jiraUrl(key)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Jira에서 열기"
          >
            <LinkOutlined />
          </a>
        </Space>
      ),
    },
    {
      title: "진행 상태",
      key: "status",
      render: (_: unknown, r: IssueSummary) => {
        if (!r.status) return <Text type="secondary">-</Text>;
        const b = stateBadge(r.status.state);
        const inProgress =
          r.status.state === "테스트중" || r.status.state === "분석중";
        return (
          <Space direction="vertical" size={2}>
            <Badge status={b.status} text={b.text} />
            {inProgress && r.status.total != null && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                진행률 {r.status.done ?? 0}/{r.status.total}
                {r.status.run != null ? ` · ${r.status.run}회차` : ""}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "종합",
      key: "overall",
      render: (_: unknown, r: IssueSummary) =>
        r.preview ? (
          <Tag color={r.preview.overallColor}>{r.preview.overallLabel}</Tag>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: "통과율",
      key: "passRate",
      width: 160,
      render: (_: unknown, r: IssueSummary) =>
        r.preview ? (
          <Space direction="vertical" size={0} style={{ width: 140 }}>
            <Progress
              percent={r.preview.passRate}
              size="small"
              status={r.preview.counts.fail > 0 ? "exception" : "success"}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              통과 {r.preview.counts.pass} · 실패 {r.preview.counts.fail}
              {r.preview.counts.skip + r.preview.counts.warn > 0
                ? ` · 스킵/주의 ${r.preview.counts.skip + r.preview.counts.warn}`
                : ""}{" "}
              / 총 {r.preview.counts.total}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: "환경",
      key: "env",
      render: (_: unknown, r: IssueSummary) =>
        r.preview?.env ? <Tag color="geekblue">{r.preview.env}</Tag> : "-",
    },
    {
      title: "국내/글로벌",
      key: "scope",
      render: (_: unknown, r: IssueSummary) =>
        r.preview?.scope ? <Tag>{r.preview.scope}</Tag> : "-",
    },
    {
      title: "테스트 일시",
      key: "testedAt",
      render: (_: unknown, r: IssueSummary) => {
        if (r.preview?.testedAt) return r.preview.testedAt;
        return r.updatedAt ? new Date(r.updatedAt).toLocaleString("ko-KR") : "-";
      },
    },
    {
      title: "리포트",
      dataIndex: "reportCount",
      key: "reportCount",
      width: 80,
      render: (n: number) => <Tag color={n > 0 ? "blue" : "default"}>{n}건</Tag>,
    },
  ];

  return (
    <div>
      <Breadcrumb
        items={[{ title: <Link href="/">홈</Link> }, { title: "이슈 테스트" }]}
        style={{ marginBottom: 12 }}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        이슈 테스트
      </Title>
      <Text type="secondary">읽는 경로: {sourceDir}</Text>
      <div style={{ marginTop: 16 }}>
        <DateFoldedTable<IssueSummary>
          items={issues}
          dateOf={(r) => r.preview?.testedAt ?? r.updatedAt}
          columns={columns}
          rowKey="key"
          onRowClick={(r) => router.push(`/issue-test/${r.key}`)}
          emptyText="아직 issue-test 결과가 없습니다"
        />
      </div>
    </div>
  );
}

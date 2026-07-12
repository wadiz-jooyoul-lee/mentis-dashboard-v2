"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Table, Tag, Typography, Empty, Space, Progress } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { EpicSummary } from "@/lib/orchestration";
import type { JobWithKey } from "@/lib/jobs";
import { jiraUrl } from "@/lib/jira";
import DobbyIcon from "@/components/DobbyIcon";
import OrderLaunchPanel from "@/components/OrderLaunchPanel";
import { dobbyColor } from "@/lib/dobby";

const { Title, Text } = Typography;

function distribution(c: EpicSummary["counts"]) {
  const items: Array<[string, number, string]> = [
    ["대기", c.대기, "default"],
    ["구현중", c.구현중, "blue"],
    ["리뷰중", c.리뷰중, "gold"],
    ["수정중", c.수정중, "orange"],
    ["재통합대기", c.재통합대기, "purple"],
    ["완료", c.완료, "green"],
  ];
  return (
    <Space size={4} wrap>
      {items
        .filter(([, n]) => n > 0)
        .map(([label, n, color]) => (
          <Tag key={label} color={color}>
            {label} {n}
          </Tag>
        ))}
      {c.total === 0 && <Text type="secondary">-</Text>}
    </Space>
  );
}

export default function OrchestrationList({
  epics,
  sourceDir,
  initialJobs = [],
}: {
  epics: EpicSummary[];
  sourceDir: string;
  initialJobs?: JobWithKey[];
}) {
  const router = useRouter();

  const columns = [
    {
      title: "에픽",
      dataIndex: "epicKey",
      key: "epicKey",
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
      title: "실행 모드",
      dataIndex: "mode",
      key: "mode",
      // 상세 설명은 떼고 앞 키워드(병렬/순차)만 간결히 표시
      render: (m: string | null) =>
        m ? <Tag>{m.split(/[\s(（]/)[0]}</Tag> : "-",
    },
    {
      title: "에이전트",
      dataIndex: "agentCount",
      key: "agentCount",
      render: (n: number) => `${n}명`,
    },
    {
      title: "상태 분포",
      key: "counts",
      render: (_: unknown, r: EpicSummary) => distribution(r.counts),
    },
    {
      title: "진행률",
      key: "progress",
      render: (_: unknown, r: EpicSummary) => {
        const total = r.counts.total ?? 0;
        const done = r.counts.완료 ?? 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <Space direction="vertical" size={2} style={{ minWidth: 160 }}>
            <Progress
              percent={pct}
              size="small"
              status={done === total && total > 0 ? "success" : "active"}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              완료 {done} / 전체 {total}
            </Text>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Breadcrumb
          items={[{ title: <Link href="/">홈</Link> }, { title: "오케스트레이션" }]}
        />
        <Link
          href="/agents"
          style={{
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
          }}
        >
          <DobbyIcon size={18} expression="happy" color={dobbyColor("소개")} />
          에이전트 소개
        </Link>
      </div>
      <Title level={2} style={{ marginTop: 0 }}>
        오케스트레이션 보드
      </Title>

      <OrderLaunchPanel initialJobs={initialJobs} />

      <Text type="secondary">읽는 경로: {sourceDir}</Text>
      <div style={{ marginTop: 16 }}>
        {epics.length === 0 ? (
          <Empty description="work-dobby 에픽이 없습니다" />
        ) : (
          <Table<EpicSummary>
            rowKey="epicKey"
            columns={columns}
            dataSource={epics}
            pagination={false}
            scroll={{ x: "max-content" }}
            onRow={(record) => ({
              onClick: () => router.push(`/orchestration/${record.epicKey}`),
              style: { cursor: "pointer" },
            })}
          />
        )}
      </div>
    </div>
  );
}

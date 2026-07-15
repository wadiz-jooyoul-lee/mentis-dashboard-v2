"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Tag, Typography, Space, Progress, Collapse, Badge } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { EpicSummary } from "@/lib/orchestration";
import { phaseBadge } from "@/lib/parseOrderStatus";
import type { JobWithKey } from "@/lib/jobs";
import { jiraUrl } from "@/lib/jira";
import DobbyIcon from "@/components/DobbyIcon";
import OrderLauncher from "@/components/OrderLauncher";
import DateFoldedTable from "@/components/DateFoldedTable";
import { dobbyColor } from "@/lib/dobby";

const { Title, Text } = Typography;

function distribution(r: EpicSummary) {
  const c = r.counts;
  const items: Array<[string, number, string]> = [
    ["대기", c.대기, "default"],
    ["분석", c.분석, "cyan"],
    ["구현", c.구현, "blue"],
    ["리뷰", c.리뷰, "gold"],
    ["완료", c.완료, "green"],
  ];
  // 에이전트 표가 아직 없는 착수 직후: 상태 분포 대신 status.md 현재 단계를 보여준다.
  if (c.total === 0) {
    return r.phaseLabel && r.phaseLabel !== "-" ? (
      <Badge status={phaseBadge(r.phase)} text={r.phaseLabel} />
    ) : (
      <Text type="secondary">-</Text>
    );
  }
  return (
    <Space size={4} wrap>
      {items
        .filter(([, n]) => n > 0)
        .map(([label, n, color]) => (
          <Tag key={label} color={color}>
            {label} {n}
          </Tag>
        ))}
    </Space>
  );
}

export default function OrchestrationList({
  epics,
  sourceDir,
  initialJobs = [],
  initialArchived = [],
}: {
  epics: EpicSummary[];
  sourceDir: string;
  initialJobs?: JobWithKey[];
  initialArchived?: JobWithKey[];
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
      title: "제목",
      dataIndex: "title",
      key: "title",
      width: 300,
      // 고정 너비에서 최대 2줄까지만, 넘치면 말줄임. hover 시 전체 제목 툴팁.
      render: (t: string | null) =>
        t ? (
          <span
            title={t}
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {t}
          </span>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: "실행 모드",
      dataIndex: "mode",
      key: "mode",
      // 짧은 모드(예: "A (대화형)")는 그대로, 긴 설명만 앞 키워드로 축약
      render: (m: string | null) => {
        if (!m) return "-";
        const t = m.trim();
        const short = t.length <= 12 ? t : t.split(/[\s(（]/)[0];
        return <Tag>{short}</Tag>;
      },
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
      render: (_: unknown, r: EpicSummary) => distribution(r),
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

      <Collapse
        ghost
        items={[
          {
            key: "launcher",
            label: "오더 실행",
            children: (
              <OrderLauncher initialJobs={initialJobs} initialArchived={initialArchived} />
            ),
          },
        ]}
      />

      <Text type="secondary">읽는 경로: {sourceDir}</Text>
      <div style={{ marginTop: 16 }}>
        <DateFoldedTable<EpicSummary>
          items={epics}
          dateOf={(r) => r.lastActivity}
          columns={columns}
          rowKey="epicKey"
          onRowClick={(r) => router.push(`/orchestration/${r.epicKey}`)}
          emptyText="진행 중인 오더가 없습니다"
        />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Breadcrumb, Table, Tag, Typography, Empty, Space } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { LifecycleRow } from "@/lib/lifecycle";
import { jiraUrl } from "@/lib/jira";

const { Title, Text } = Typography;

/** 한 단계 셀: 데이터가 있으면 태그+링크, 없으면 흐린 대시. */
function StageCell({
  label,
  color,
  href,
}: {
  label: string | null;
  color: string;
  href: string;
}) {
  if (!label) return <Text type="secondary">—</Text>;
  return (
    <Link href={href}>
      <Tag color={color} style={{ cursor: "pointer" }}>
        {label}
      </Tag>
    </Link>
  );
}

export default function LifecycleView({ rows }: { rows: LifecycleRow[] }) {
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
            title="Jira에서 열기"
          >
            <LinkOutlined />
          </a>
        </Space>
      ),
    },
    { title: "제목", dataIndex: "title", key: "title", ellipsis: true },
    {
      title: "① 착수",
      key: "start",
      render: (_: unknown, r: LifecycleRow) => (
        <StageCell
          label={r.startState}
          color={
            r.startState === "해결됨"
              ? "green"
              : r.startState === "분석완료"
              ? "blue"
              : "orange"
          }
          href={`/issue-start/${r.key}`}
        />
      ),
    },
    {
      title: "② 테스트",
      key: "test",
      render: (_: unknown, r: LifecycleRow) => (
        <StageCell
          label={r.testState}
          color={r.testOverallColor ?? "blue"}
          href={`/issue-test/${r.key}`}
        />
      ),
    },
    {
      title: "③ 종료",
      key: "end",
      render: (_: unknown, r: LifecycleRow) => (
        <StageCell
          label={
            r.endFinalStatus
              ? `${r.endFinalStatus}${r.endAction ? ` · ${r.endAction}` : ""}`
              : null
          }
          color="green"
          href={`/issue-end/${r.key}`}
        />
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        items={[{ title: <Link href="/">홈</Link> }, { title: "생명주기 개요" }]}
        style={{ marginBottom: 12 }}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        생명주기 개요
      </Title>
      <Text type="secondary">
        이슈별 착수 → 테스트 → 종료 단계. 각 단계 태그를 누르면 상세로 이동합니다.
      </Text>
      <div style={{ marginTop: 16 }}>
        {rows.length === 0 ? (
          <Empty description="표시할 이슈가 없습니다" />
        ) : (
          <Table<LifecycleRow>
            rowKey="key"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: "max-content" }}
          />
        )}
      </div>
    </div>
  );
}

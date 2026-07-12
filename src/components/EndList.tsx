"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Tag, Typography, Space } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { IssueEnd } from "@/lib/parseEnd";
import { endActionBadge, finalStatusColor } from "@/lib/parseEnd";
import { jiraUrl } from "@/lib/jira";
import DateFoldedTable from "@/components/DateFoldedTable";

const { Title, Text } = Typography;

export default function EndList({
  ends,
  sourceDir,
}: {
  ends: IssueEnd[];
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
      title: "타입",
      dataIndex: "type",
      key: "type",
      render: (t: string | null) =>
        t ? <Tag color={t.includes("버그") ? "red" : "blue"}>{t}</Tag> : "-",
    },
    { title: "제목", dataIndex: "title", key: "title", ellipsis: true },
    {
      title: "최종 상태",
      dataIndex: "finalStatus",
      key: "finalStatus",
      render: (v: string | null) =>
        v ? <Tag color={finalStatusColor(v)}>{v}</Tag> : "-",
    },
    {
      title: "워크트리 처리",
      key: "action",
      render: (_: unknown, r: IssueEnd) => {
        const b = endActionBadge(r.worktreeAction);
        return <Tag color={b.color}>{b.text}</Tag>;
      },
    },
    {
      title: "처리 일시",
      dataIndex: "processedAt",
      key: "processedAt",
      render: (v: string | null) => v ?? "-",
    },
  ];

  return (
    <div>
      <Breadcrumb
        items={[{ title: <Link href="/">홈</Link> }, { title: "이슈 종료" }]}
        style={{ marginBottom: 12 }}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        이슈 종료
      </Title>
      <Text type="secondary">읽는 경로: {sourceDir}</Text>
      <div style={{ marginTop: 16 }}>
        <DateFoldedTable<IssueEnd>
          items={ends}
          dateOf={(r) => r.processedAt}
          columns={columns}
          rowKey="key"
          onRowClick={(r) => router.push(`/issue-end/${r.key}`)}
          emptyText="issue-end 종료 서머리가 없습니다"
        />
      </div>
    </div>
  );
}

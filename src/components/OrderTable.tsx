"use client";

import { useRouter } from "next/navigation";
import { Typography, Space, Tag, Badge, Progress } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import DateFoldedTable from "@/components/DateFoldedTable";
import { phaseBadge, phaseText } from "@/lib/parseOrderStatus";
import type { OrderSummary } from "@/lib/orders";

const { Text } = Typography;

function passRate(o: OrderSummary): number | null {
  const t = o.latestTest;
  if (!t || t.pass == null) return null;
  const total = (t.pass ?? 0) + (t.fail ?? 0) + (t.skip ?? 0);
  return total > 0 ? Math.round(((t.pass ?? 0) / total) * 100) : null;
}

/** 오더 목록 표(날짜 접이식). 브레드크럼·제목·실행 패널은 상위(OrderHome)에서. */
export default function OrderTable({
  orders,
  emptyText,
}: {
  orders: OrderSummary[];
  emptyText?: string;
}) {
  const router = useRouter();

  const columns: ColumnsType<OrderSummary> = [
    {
      title: "키",
      dataIndex: "key",
      render: (_, o) => (
        <Space size={4}>
          <Text strong>{o.key}</Text>
          {o.jira && (
            <a href={o.jira} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              <LinkOutlined />
            </a>
          )}
          {o.kind === "task" && <Tag>문서</Tag>}
        </Space>
      ),
    },
    {
      title: "제목",
      dataIndex: "title",
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "타입",
      dataIndex: "type",
      render: (v: string | null) => (v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: "단계",
      dataIndex: "phase",
      render: (_, o) => <Badge status={phaseBadge(o.phase)} text={phaseText(o.phaseRaw, o.phase)} />,
    },
    {
      title: "K",
      dataIndex: "k",
      render: (_, o) =>
        o.k != null ? (
          <Tag color={o.k >= 2 ? "blue" : "default"}>
            K={o.k}
            {o.agentCount > 0 ? ` · ${o.agentCount}명` : ""}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "테스트",
      dataIndex: "latestTest",
      render: (_, o) => {
        const r = passRate(o);
        if (r == null) return <Text type="secondary">—</Text>;
        return (
          <Space size={6}>
            <Progress
              type="circle"
              size={28}
              percent={r}
              format={(p) => `${p}`}
              status={o.latestTest?.fail ? "exception" : "success"}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {o.latestTest?.pass ?? 0}/{o.latestTest?.fail ?? 0}/{o.latestTest?.skip ?? 0}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "갱신",
      dataIndex: "updatedAt",
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
  ];

  return (
    <DateFoldedTable<OrderSummary>
      items={orders}
      dateOf={(o) => o.updatedAt}
      columns={columns}
      rowKey="key"
      onRowClick={(o) => router.push(`/orders/${o.key}`)}
      emptyText={emptyText ?? "오더 없음"}
    />
  );
}

"use client";

import { Space, Tag, Typography, Table, Tooltip } from "antd";
import { fmtBytes, fmtDate } from "@/components/SessionBackupTable";

const { Text } = Typography;

export type OrchArchive = {
  key: string;
  name: string;
  at: string;
  sizeBytes: number;
  rawBytes: number | null;
  files: number | null;
  ratio: number | null;
  stale: boolean;
};

/** 오더 폴더별 메타 아카이브 목록(해결 시점 스냅샷). */
export default function OrchestrationBackupTable({ archives }: { archives: OrchArchive[] }) {
  const columns = [
    {
      title: "오더",
      dataIndex: "key",
      key: "key",
      render: (v: string, row: OrchArchive) => (
        <Space size={6}>
          <Text strong style={{ fontSize: 13 }}>{v}</Text>
          {row.stale ? (
            <Tooltip title="이 백업 이후 메타가 바뀌었습니다 — 다시 백업하면 최신으로 교체됩니다">
              <Tag color="warning">변경됨</Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    { title: "백업 시각", dataIndex: "at", key: "at", render: (v: string) => fmtDate(v) },
    {
      title: "파일 수",
      dataIndex: "files",
      key: "files",
      align: "right" as const,
      render: (n: number | null) => (n == null ? "-" : n.toLocaleString()),
    },
    { title: "원본", dataIndex: "rawBytes", key: "raw", align: "right" as const, render: (n: number | null) => fmtBytes(n) },
    { title: "압축", dataIndex: "sizeBytes", key: "size", align: "right" as const, render: (n: number) => fmtBytes(n) },
    {
      title: "배율",
      dataIndex: "ratio",
      key: "ratio",
      align: "right" as const,
      render: (n: number | null) => (n == null ? "-" : `${n.toFixed(1)}배`),
    },
  ];
  return (
    <Table<OrchArchive>
      size="small"
      rowKey="name"
      columns={columns}
      dataSource={archives}
      pagination={archives.length > 30 ? { pageSize: 30, showSizeChanger: false } : false}
      locale={{ emptyText: "메타 백업이 없습니다 — '전체 백업'을 누르면 한 번에 만듭니다" }}
    />
  );
}

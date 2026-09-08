"use client";

import { Space, Tag, Typography, Table } from "antd";
import { fmtBytes, fmtDate } from "@/components/SessionBackupTable";

const { Text } = Typography;

export type InProgressArchive = {
  name: string;
  day: string;
  slot: "am" | "pm";
  at: string;
  sizeBytes: number;
  orders: number | null;
  files: number | null;
  rawBytes: number | null;
  ratio: number | null;
};

const SLOT_LABEL = { am: "오전", pm: "오후" } as const;

function fmtDay(day: string): string {
  if (!/^\d{8}$/.test(day)) return day;
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
}

/** 작업중인 폴더들을 한 덩이로 모은 임시 백업 목록(하루 두 회차). */
export default function InProgressBackupTable({
  archives,
  today,
}: {
  archives: InProgressArchive[];
  today: string;
}) {
  const columns = [
    {
      title: "날짜",
      dataIndex: "day",
      key: "day",
      render: (v: string) => (
        <Space size={6}>
          <Text strong style={{ fontSize: 13 }}>{fmtDay(v)}</Text>
          {v === today ? <Tag color="blue">오늘</Tag> : null}
        </Space>
      ),
    },
    {
      title: "회차",
      dataIndex: "slot",
      key: "slot",
      render: (s: "am" | "pm") => <Tag>{SLOT_LABEL[s]}</Tag>,
    },
    { title: "실행 시각", dataIndex: "at", key: "at", render: (v: string) => fmtDate(v) },
    {
      title: "담긴 오더",
      dataIndex: "orders",
      key: "orders",
      align: "right" as const,
      render: (n: number | null) => (n == null ? "-" : `${n}개`),
    },
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
    <Table<InProgressArchive>
      size="small"
      rowKey="name"
      columns={columns}
      dataSource={archives}
      pagination={archives.length > 30 ? { pageSize: 30, showSizeChanger: false } : false}
      locale={{ emptyText: "진행중 백업이 없습니다 — 오전 10시·오후 3시 이후 대시보드를 열면 자동으로 만듭니다" }}
    />
  );
}

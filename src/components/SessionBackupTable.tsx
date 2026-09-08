"use client";

import { Typography, Table, Tag } from "antd";

const { Text } = Typography;

export type SessionArchive = { name: string; kind: string; at: string; sizeBytes: number; files: number | null };

export function fmtBytes(n: number | null): string {
  if (n == null) return "-";
  if (n <= 0) return "0";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)}${u[i]}`;
}
export function fmtDate(iso: string | null): string {
  if (!iso) return "없음";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "없음" : d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

/** 세션 전사(~/.claude/projects) 증분 백업 아카이브 목록. */
export default function SessionBackupTable({ archives }: { archives: SessionArchive[] }) {
  const columns = [
    { title: "시각", dataIndex: "at", key: "at", render: (v: string) => fmtDate(v) },
    {
      title: "종류",
      dataIndex: "kind",
      key: "kind",
      render: (k: string) => <Tag color={k === "FULL" ? "blue" : "default"}>{k === "FULL" ? "전체" : "변경분"}</Tag>,
    },
    {
      title: "파일 수",
      dataIndex: "files",
      key: "files",
      align: "right" as const,
      render: (n: number | null) => (n == null ? "-" : n.toLocaleString()),
    },
    {
      title: "크기",
      dataIndex: "sizeBytes",
      key: "size",
      align: "right" as const,
      render: (n: number) => fmtBytes(n),
    },
    {
      title: "파일명",
      dataIndex: "name",
      key: "name",
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
  ];
  return (
    <Table<SessionArchive>
      size="small"
      rowKey="name"
      columns={columns}
      dataSource={archives}
      pagination={archives.length > 30 ? { pageSize: 30, showSizeChanger: false } : false}
      locale={{ emptyText: "백업 아카이브가 없습니다" }}
    />
  );
}

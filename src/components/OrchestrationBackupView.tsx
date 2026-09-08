"use client";

import { useCanAct } from "@/components/CanAct";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Space, Tag, Button, Typography, Table, Statistic, message, Tooltip } from "antd";
import { SaveOutlined, ReloadOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

type OrchArchive = {
  key: string;
  name: string;
  at: string;
  sizeBytes: number;
  rawBytes: number | null;
  files: number | null;
  ratio: number | null;
  stale: boolean;
};

function fmtBytes(n: number | null): string {
  if (n == null) return "-";
  if (n <= 0) return "0";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)}${u[i]}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "없음";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "없음" : d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export default function OrchestrationBackupView({
  archives,
  totalBytes,
  orders,
  missing,
  stale,
  running: initialRunning,
  dest,
}: {
  archives: OrchArchive[];
  totalBytes: number;
  orders: number;
  missing: number;
  stale: number;
  running: boolean;
  dest: string;
}) {
  const canAct = useCanAct();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(initialRunning);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/backup/orchestration", { cache: "no-store" });
      const s = await r.json();
      setRunning(!!s.running);
      if (!s.running && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
        router.refresh(); // 목록 갱신
      }
    } catch {
      /* 무시 */
    }
  }, [router]);

  useEffect(() => {
    if (running && !timer.current) timer.current = setInterval(poll, 3000);
    return () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
    };
  }, [running, poll]);

  const runAll = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/backup/orchestration", { method: "POST" });
      if (r.ok) {
        message.success("전체 백업을 시작했습니다");
        setRunning(true);
      } else {
        const d = await r.json().catch(() => null);
        message.error(d?.error || "백업 시작 실패");
      }
    } finally {
      setBusy(false);
    }
  };

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
    {
      title: "백업 시각",
      dataIndex: "at",
      key: "at",
      render: (v: string) => fmtDate(v),
    },
    {
      title: "파일 수",
      dataIndex: "files",
      key: "files",
      align: "right" as const,
      render: (n: number | null) => (n == null ? "-" : n.toLocaleString()),
    },
    {
      title: "원본",
      dataIndex: "rawBytes",
      key: "raw",
      align: "right" as const,
      render: (n: number | null) => fmtBytes(n),
    },
    {
      title: "압축",
      dataIndex: "sizeBytes",
      key: "size",
      align: "right" as const,
      render: (n: number) => fmtBytes(n),
    },
    {
      title: "배율",
      dataIndex: "ratio",
      key: "ratio",
      align: "right" as const,
      render: (n: number | null) => (n == null ? "-" : `${n.toFixed(1)}배`),
    },
  ];

  return (
    <div style={{ marginTop: 32 }}>
      <Title level={3} style={{ marginBottom: 4 }}>오케스트레이션 메타 백업</Title>
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        오더 폴더(<Text code>{"{키}/"}</Text>)의 문서·리뷰·코드 변경 기록을 폴더 단위로 압축해 둡니다.
        해결 처리할 때 그 폴더만 자동으로 다시 만들고, 검증을 통과하면 이전 백업을 교체합니다.
        화면 확인용 이미지는 담지 않습니다. 저장 위치: <Text code>{dest}</Text>
      </Paragraph>

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <Space size={32} wrap>
            <Statistic title="백업된 오더" value={archives.length} suffix={`/ ${orders}개`} valueStyle={{ fontSize: 16 }} />
            <Statistic
              title="미백업"
              value={missing}
              suffix="개"
              valueStyle={{ fontSize: 16, color: missing > 0 ? "#d48806" : undefined }}
            />
            <Statistic
              title="변경됨"
              value={stale}
              suffix="개"
              valueStyle={{ fontSize: 16, color: stale > 0 ? "#d48806" : undefined }}
            />
            <Statistic title="총 용량" value={fmtBytes(totalBytes)} valueStyle={{ fontSize: 16 }} />
          </Space>
          {running ? (
            <Tag color="processing" icon={<ReloadOutlined spin />}>백업 중…</Tag>
          ) : canAct ? (
            <Button icon={<SaveOutlined />} loading={busy} onClick={runAll}>
              전체 백업
            </Button>
          ) : null}
        </div>
      </Card>

      <Table<OrchArchive>
        size="small"
        rowKey="name"
        columns={columns}
        dataSource={archives}
        pagination={archives.length > 30 ? { pageSize: 30, showSizeChanger: false } : false}
        locale={{ emptyText: "메타 백업이 없습니다 — '전체 백업'을 누르면 한 번에 만듭니다" }}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumb, Card, Space, Tag, Button, Typography, Table, Collapse, Statistic, message } from "antd";
import { SaveOutlined, ReloadOutlined, FileZipOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

type BackupFile = { name: string; kind: string; at: string; sizeBytes: number; files: number | null };
type Status = { lastBackupAt: string | null; pending: number; running: boolean };

function fmtBytes(n: number): string {
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

export default function BackupListView({
  archives,
  totalBytes,
  log,
  status,
  dest,
}: {
  archives: BackupFile[];
  totalBytes: number;
  log: string;
  status: Status;
  dest: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(status.running);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/backup", { cache: "no-store" });
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

  const runBackup = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/backup", { method: "POST" });
      if (r.ok) {
        message.success("백업을 시작했습니다");
        setRunning(true);
      } else {
        message.error("백업 시작 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      title: "시각",
      dataIndex: "at",
      key: "at",
      render: (v: string) => fmtDate(v),
    },
    {
      title: "종류",
      dataIndex: "kind",
      key: "kind",
      render: (k: string) => <Tag color={k === "FULL" ? "blue" : "default"}>{k}</Tag>,
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
    <div>
      <Breadcrumb style={{ marginBottom: 12 }} items={[{ title: <Link href="/">홈</Link> }, { title: "백업" }]} />
      <Title level={2} style={{ marginTop: 0 }}>세션 백업</Title>
      <Paragraph type="secondary" style={{ marginTop: -4 }}>
        Claude 세션 전사(<Text code>~/.claude/projects</Text>)의 증분 압축 백업입니다. 저장 위치: <Text code>{dest}</Text>
      </Paragraph>

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <Space size={32} wrap>
            <Statistic title="마지막 백업" value={fmtDate(status.lastBackupAt)} valueStyle={{ fontSize: 16 }} />
            <Statistic title="미백업" value={status.pending} suffix="개" valueStyle={{ fontSize: 16, color: status.pending > 0 ? "#d48806" : undefined }} />
            <Statistic title="아카이브" value={archives.length} suffix="개" valueStyle={{ fontSize: 16 }} />
            <Statistic title="총 용량" value={fmtBytes(totalBytes)} valueStyle={{ fontSize: 16 }} />
          </Space>
          {running ? (
            <Tag color="processing" icon={<ReloadOutlined spin />}>백업 중…</Tag>
          ) : (
            <Button type="primary" icon={<SaveOutlined />} loading={busy} onClick={runBackup}>
              지금 백업
            </Button>
          )}
        </div>
      </Card>

      <Table<BackupFile>
        size="small"
        rowKey="name"
        columns={columns}
        dataSource={archives}
        pagination={false}
        locale={{ emptyText: "백업 아카이브가 없습니다" }}
      />

      <Collapse
        style={{ marginTop: 16 }}
        items={[
          {
            key: "log",
            label: (
              <Space size={6}>
                <FileZipOutlined />
                백업 히스토리 로그 (참고용)
              </Space>
            ),
            children: (
              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 360, overflow: "auto" }}>
                {log.trim() || "(로그 없음)"}
              </pre>
            ),
          },
        ]}
      />
    </div>
  );
}

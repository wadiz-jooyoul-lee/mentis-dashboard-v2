"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, Input, Button, Space, Collapse, Badge, Typography, message, Empty } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import JobConsole from "@/components/JobConsole";
import { ORDER_KEY_RE } from "@/lib/keys";
import type { JobWithKey, JobState } from "@/lib/jobs";

const { Text, Paragraph } = Typography;

const BADGE: Record<Exclude<JobState, "none">, { status: "processing" | "success" | "error" | "default"; text: string }> = {
  running: { status: "processing", text: "실행 중" },
  done: { status: "success", text: "완료" },
  failed: { status: "error", text: "실패" },
  stopped: { status: "default", text: "정지됨" },
};

export default function OrderLauncher({
  initialJobs,
  initialArchived,
}: {
  initialJobs: JobWithKey[];
  initialArchived: JobWithKey[];
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<JobWithKey[]>(initialJobs);
  const [archived, setArchived] = useState<JobWithKey[]>(initialArchived);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/orders", { cache: "no-store" });
      const data = await r.json();
      setJobs(data.jobs ?? []);
      setArchived(data.archived ?? []);
    } catch {
      /* 무시 */
    }
  }, []);

  const anyRunning = jobs.some((j) => j.state === "running");
  useEffect(() => {
    if (anyRunning) {
      timer.current = setInterval(refresh, 2500);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [anyRunning, refresh]);

  const launch = async () => {
    const k = key.trim();
    if (!ORDER_KEY_RE.test(k)) {
      message.error("이슈 키 형식이 아닙니다 (예: FE1-1187)");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: k }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        message.success(`${k} 실행 시작`);
        setKey("");
        await refresh();
      } else {
        message.error(body?.error === "already_running" ? "이미 실행 중" : body?.error ?? "실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const unarchive = async (k: string) => {
    await fetch("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: k, unarchive: true }),
    });
    await refresh();
  };

  const jobPanels = jobs.map((j) => ({
    key: j.key,
    label: (
      <Space>
        <Text strong>{j.key}</Text>
        <Badge {...BADGE[j.state]} />
      </Space>
    ),
    children: <JobConsole orderKey={j.key} initial={j} onChange={refresh} />,
  }));

  const archivedPanels = archived.map((j) => ({
    key: j.key,
    label: (
      <Space>
        <Text type="secondary">{j.key}</Text>
        <Badge {...BADGE[j.state]} />
      </Space>
    ),
    children: (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Button size="small" onClick={() => unarchive(j.key)}>
          복원
        </Button>
        <JobConsole orderKey={j.key} initial={j} onChange={refresh} />
      </Space>
    ),
  }));

  return (
    <Card size="small" title={<Space><PlayCircleOutlined />오더 실행 (dobby-order)</Space>}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          이슈 키로 <code>/dobby-order</code>를 백그라운드 실행합니다. 진행 로그는 아래에서 실시간으로 확인됩니다.
          <br />
          <Text type="warning">주의: 헤드리스 claude를 bypassPermissions로 실행합니다.</Text>
        </Paragraph>
        <Space.Compact style={{ width: "100%", maxWidth: 420 }}>
          <Input
            placeholder="FE1-1187"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onPressEnter={launch}
            disabled={busy}
          />
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={launch} loading={busy}>
            실행
          </Button>
        </Space.Compact>

        {jobs.length > 0 ? (
          <Collapse items={jobPanels} defaultActiveKey={anyRunning ? [jobs.find((j) => j.state === "running")!.key] : []} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="실행 중이거나 최근 실행한 잡이 없습니다" />
        )}

        {archived.length > 0 && (
          <Collapse
            items={[
              {
                key: "archived",
                label: <Text type="secondary">보관된 잡 ({archived.length})</Text>,
                children: <Collapse items={archivedPanels} />,
              },
            ]}
          />
        )}
      </Space>
    </Card>
  );
}

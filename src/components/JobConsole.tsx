"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Space, Button, Badge, Typography, message } from "antd";
import {
  StopOutlined,
  RedoOutlined,
  InboxOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import FeedView from "@/components/FeedView";
import type { JobStatus, JobState } from "@/lib/jobs";

const { Text } = Typography;

const BADGE: Record<Exclude<JobState, "none">, { status: "processing" | "success" | "error" | "default"; text: string }> = {
  running: { status: "processing", text: "실행 중" },
  done: { status: "success", text: "완료" },
  failed: { status: "error", text: "실패" },
  stopped: { status: "default", text: "정지됨" },
};

export default function JobConsole({
  orderKey,
  initial,
  height = 320,
  onChange,
}: {
  orderKey: string;
  initial?: JobStatus;
  height?: number | string;
  /** 상태가 바뀔 때 부모에게 알림(목록 갱신 등) */
  onChange?: () => void;
}) {
  const [s, setS] = useState<JobStatus>(initial ?? { state: "none" });
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders?key=${encodeURIComponent(orderKey)}`, {
        cache: "no-store",
      });
      const data: JobStatus = await r.json();
      setS(data);
    } catch {
      /* 무시 */
    }
  }, [orderKey]);

  // 초기 1회 + running 동안 2초 폴링
  useEffect(() => {
    if (!initial) refresh();
  }, [initial, refresh]);

  useEffect(() => {
    if (s.state === "running") {
      timer.current = setInterval(refresh, 2000);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
  }, [s.state, refresh]);

  const act = async (fn: () => Promise<Response>, ok: string) => {
    setBusy(true);
    try {
      const r = await fn();
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        message.success(ok);
        await refresh();
        onChange?.();
      } else {
        message.error(body?.error ?? "실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    act(
      () =>
        fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: orderKey }),
        }),
      "실행 시작"
    );
  const stop = () =>
    act(() => fetch(`/api/orders?key=${encodeURIComponent(orderKey)}`, { method: "DELETE" }), "정지 요청됨");
  const resume = () =>
    act(
      () =>
        fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: orderKey, resume: true }),
        }),
      "재개됨"
    );
  const archive = () =>
    act(
      () => fetch(`/api/orders?key=${encodeURIComponent(orderKey)}&action=archive`, { method: "DELETE" }),
      "보관됨"
    );

  const feed = s.state === "none" ? [] : s.feed;
  const badge = s.state === "none" ? null : BADGE[s.state];
  const canResume =
    (s.state === "failed" || s.state === "stopped") &&
    !!(s as { sessionId?: string | null }).sessionId;

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Space wrap>
        {badge ? <Badge status={badge.status} text={badge.text} /> : <Text type="secondary">잡 없음</Text>}
        <Button size="small" icon={<ReloadOutlined />} onClick={refresh} disabled={busy}>
          새로고침
        </Button>
        {s.state === "running" && (
          <Button size="small" danger icon={<StopOutlined />} onClick={stop} loading={busy}>
            정지
          </Button>
        )}
        {s.state !== "running" && (
          <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={start} loading={busy}>
            {s.state === "none" ? "실행" : "새로 실행"}
          </Button>
        )}
        {canResume && (
          <Button size="small" icon={<RedoOutlined />} onClick={resume} loading={busy}>
            이어서
          </Button>
        )}
        {(s.state === "done" || s.state === "failed" || s.state === "stopped") && (
          <Button size="small" icon={<InboxOutlined />} onClick={archive} loading={busy}>
            보관
          </Button>
        )}
      </Space>
      <FeedView feed={feed} height={height} />
    </Space>
  );
}

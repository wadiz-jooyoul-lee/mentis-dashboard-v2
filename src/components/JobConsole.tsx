"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Space, Button, Badge, Typography, Input, Tag, message } from "antd";
import {
  StopOutlined,
  RedoOutlined,
  InboxOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  SendOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import FeedView from "@/components/FeedView";
import type { JobStatus, JobState } from "@/lib/jobs";

const { Text } = Typography;
const { TextArea } = Input;

const BADGE: Record<Exclude<JobState, "none">, { status: "processing" | "success" | "error" | "default"; text: string }> = {
  running: { status: "processing", text: "실행 중" },
  done: { status: "success", text: "완료" },
  failed: { status: "error", text: "실패" },
  stopped: { status: "default", text: "정지됨" },
};

type Running = Exclude<JobStatus, { state: "none" }>;

export default function JobConsole({
  orderKey,
  initial,
  height = 320,
  onChange,
}: {
  orderKey: string;
  initial?: JobStatus;
  height?: number | string;
  onChange?: () => void;
}) {
  const [s, setS] = useState<JobStatus>(initial ?? { state: "none" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const injecting = useRef(false);

  const pending = s.state === "none" ? null : (s as Running).pending;
  const sessionId = s.state === "none" ? null : (s as Running).sessionId;

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders?key=${encodeURIComponent(orderKey)}`, { cache: "no-store" });
      setS(await r.json());
    } catch {
      /* 무시 */
    }
  }, [orderKey]);

  useEffect(() => {
    if (!initial) refresh();
  }, [initial, refresh]);

  // 실행 중이거나 예약이 걸려 있으면 폴링(예약 있으면 종료 감지를 위해 더 자주)
  useEffect(() => {
    const active = s.state === "running" || (!!pending && !!sessionId);
    if (!active) return;
    const iv = pending ? 1000 : 2000;
    timer.current = setInterval(refresh, iv);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [s.state, pending, sessionId, refresh]);

  // 예약 자동 주입: 실행이 끝났고(pending+세션 존재) → 즉시 이어서 넣는다.
  useEffect(() => {
    if (s.state === "none" || s.state === "running") return;
    if (pending && sessionId && !injecting.current) {
      injecting.current = true;
      fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: orderKey, applyPending: true }),
      })
        .then(() => {
          message.success("예약한 피드백을 이어서 전달했습니다");
          return refresh();
        })
        .catch(() => {})
        .finally(() => {
          injecting.current = false;
          onChange?.();
        });
    }
  }, [s.state, pending, sessionId, orderKey, refresh, onChange]);

  const post = (body: object) =>
    fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const act = async (fn: () => Promise<Response>, ok: string) => {
    setBusy(true);
    try {
      const r = await fn();
      const b = await r.json().catch(() => ({}));
      if (r.ok) {
        message.success(ok);
        await refresh();
        onChange?.();
      } else {
        message.error(b?.error ?? "실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const stop = () => act(() => fetch(`/api/orders?key=${encodeURIComponent(orderKey)}`, { method: "DELETE" }), "정지 요청됨");
  const start = () => act(() => post({ key: orderKey }), "실행 시작");
  const archive = () => act(() => fetch(`/api/orders?key=${encodeURIComponent(orderKey)}&action=archive`, { method: "DELETE" }), "보관됨");

  // 피드백: 실행 중이면 예약(다음 턴 자동 주입), 아니면 즉시 이어서 전송.
  const sendNow = () => {
    if (!msg.trim()) return;
    if (!sessionId) return message.error("세션이 아직 없어 전달할 수 없습니다");
    act(() => post({ key: orderKey, resume: true, message: msg }), "이어서 전달").then(() => setMsg(""));
  };
  const queue = () => {
    if (!msg.trim()) return;
    act(() => post({ key: orderKey, queue: true, message: msg }), "예약됨 (다음 턴에 자동 전달)").then(() => setMsg(""));
  };
  const cancelQueue = () => act(() => post({ key: orderKey, unqueue: true }), "예약 취소");

  const running = s.state === "running";
  const badge = s.state === "none" ? null : BADGE[s.state];
  const canResume = (s.state === "failed" || s.state === "stopped") && !!sessionId;

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Space wrap>
        {badge ? <Badge status={badge.status} text={badge.text} /> : <Text type="secondary">잡 없음</Text>}
        <Button size="small" icon={<ReloadOutlined />} onClick={refresh} disabled={busy}>새로고침</Button>
        {running && <Button size="small" danger icon={<StopOutlined />} onClick={stop} loading={busy}>정지</Button>}
        {!running && (
          <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={start} loading={busy}>
            {s.state === "none" ? "실행" : "새로 실행"}
          </Button>
        )}
        {canResume && <Button size="small" icon={<RedoOutlined />} onClick={() => act(() => post({ key: orderKey, resume: true }), "이어서")} loading={busy}>이어서</Button>}
        {(s.state === "done" || s.state === "failed" || s.state === "stopped") && (
          <Button size="small" icon={<InboxOutlined />} onClick={archive} loading={busy}>보관</Button>
        )}
      </Space>

      {pending && (
        <Tag icon={<ClockCircleOutlined />} color="processing" closable onClose={cancelQueue}>
          예약된 피드백: {pending.length > 40 ? pending.slice(0, 40) + "…" : pending}
        </Tag>
      )}

      <FeedView feed={s.state === "none" ? [] : s.feed} height={height} />

      {/* 피드백 입력 — 실행 중이면 예약, 아니면 즉시 이어서 */}
      {s.state !== "none" && (
        <Space.Compact style={{ width: "100%" }}>
          <TextArea
            placeholder={
              running
                ? "실행 중 — 여기 입력해 두면 이번 턴이 끝나는 즉시 자동으로 전달됩니다 (예약)"
                : "이어서 지시할 피드백을 입력 (⌘/Ctrl+Enter 전송)"
            }
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onPressEnter={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                running ? queue() : sendNow();
              }
            }}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={busy}
          />
          {running ? (
            <Button icon={<ClockCircleOutlined />} onClick={queue} loading={busy} disabled={!msg.trim()}>예약</Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={sendNow} loading={busy} disabled={!msg.trim() || !sessionId}>전송</Button>
          )}
        </Space.Compact>
      )}
    </Space>
  );
}

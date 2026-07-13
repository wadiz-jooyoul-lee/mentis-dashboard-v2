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
import type { JobState } from "@/lib/jobs";
import type { ConsoleStatus } from "@/lib/transcript";

const { Text } = Typography;
const { TextArea } = Input;

const BADGE: Record<Exclude<JobState, "none">, { status: "processing" | "success" | "error" | "default"; text: string }> = {
  running: { status: "processing", text: "실행 중" },
  done: { status: "success", text: "완료" },
  failed: { status: "error", text: "실패" },
  stopped: { status: "default", text: "정지됨" },
};

type Running = Exclude<ConsoleStatus, { state: "none" }>;

export default function JobConsole({
  orderKey,
  source,
  agent,
  phase,
  initial,
  height = 320,
  onChange,
}: {
  orderKey: string;
  /** "session" 이면 부모 세션 기록(읽기전용). 기본(미지정)은 실시간 run.log. */
  source?: "session";
  /** 서브에이전트 콘솔이면 그 슬러그/id (지정 시 기록 재생·추적, 읽기전용) */
  agent?: string;
  phase?: string;
  initial?: ConsoleStatus;
  height?: number | string;
  onChange?: () => void;
}) {
  const [s, setS] = useState<ConsoleStatus>(initial ?? { state: "none" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const injecting = useRef(false);

  const nn = s.state !== "none" ? (s as Running) : null;
  const pending = nn?.pending ?? null;
  const sessionId = nn?.sessionId ?? null;
  const mode = nn?.mode ?? "job";
  const controllable = nn ? nn.controllable ?? true : true;
  const live = nn?.live ?? s.state === "running";

  const query = new URLSearchParams({ key: orderKey });
  if (agent) query.set("agent", agent);
  if (phase) query.set("phase", phase);
  if (source) query.set("source", source);
  const qs = query.toString();

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders?${qs}`, { cache: "no-store" });
      setS(await r.json());
    } catch {
      /* 무시 */
    }
  }, [qs]);

  useEffect(() => {
    if (!initial) refresh();
  }, [initial, refresh]);

  // 폴링: 이 콘솔이 열려 있는 동안만(언마운트 시 해제).
  //  - 제어형(잡): 실행 중이거나 예약 대기 중일 때
  //  - 기록형(서브/세션): 파일이 아직 커지는 중(추적)일 때만. 유휴(재생)면 멈춘다.
  useEffect(() => {
    const active = controllable
      ? s.state === "running" || (!!pending && !!sessionId)
      : mode === "transcript" && live;
    if (!active) return;
    const iv = controllable ? (pending ? 1000 : 2000) : 2500;
    timer.current = setInterval(refresh, iv);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [controllable, s.state, mode, live, pending, sessionId, refresh]);

  // 예약 자동 주입(제어형 잡만): 실행이 끝났고 예약+세션이 있으면 즉시 이어서.
  useEffect(() => {
    if (!controllable || s.state === "none" || s.state === "running") return;
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
  }, [controllable, s.state, pending, sessionId, orderKey, refresh, onChange]);

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
  const canResume = controllable && (s.state === "failed" || s.state === "stopped") && !!sessionId;

  // 배지: 기록형이면 추적중/재생, 제어형이면 실행중/완료/…
  const badge =
    s.state === "none"
      ? mode === "transcript"
        ? { status: "default" as const, text: "로그 없음" }
        : null
      : mode === "transcript"
      ? live
        ? { status: "processing" as const, text: "추적 중" }
        : { status: "default" as const, text: "재생" }
      : BADGE[s.state];

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Space wrap>
        {badge ? <Badge status={badge.status} text={badge.text} /> : <Text type="secondary">잡 없음</Text>}
        {nn?.label && <Tag>{nn.label}</Tag>}
        {!controllable && <Text type="secondary" style={{ fontSize: 12 }}>읽기 전용</Text>}
        <Button size="small" icon={<ReloadOutlined />} onClick={refresh} disabled={busy}>새로고침</Button>
        {controllable && running && <Button size="small" danger icon={<StopOutlined />} onClick={stop} loading={busy}>정지</Button>}
        {controllable && !running && (
          <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />} onClick={start} loading={busy}>
            {s.state === "none" ? "실행" : "새로 실행"}
          </Button>
        )}
        {canResume && <Button size="small" icon={<RedoOutlined />} onClick={() => act(() => post({ key: orderKey, resume: true }), "이어서")} loading={busy}>이어서</Button>}
        {controllable && (s.state === "done" || s.state === "failed" || s.state === "stopped") && (
          <Button size="small" icon={<InboxOutlined />} onClick={archive} loading={busy}>보관</Button>
        )}
      </Space>

      {controllable && pending && (
        <Tag icon={<ClockCircleOutlined />} color="processing" closable onClose={cancelQueue}>
          예약된 피드백: {pending.length > 40 ? pending.slice(0, 40) + "…" : pending}
        </Tag>
      )}

      <FeedView feed={s.state === "none" ? [] : s.feed} height={height} alwaysBottom={mode === "transcript"} />

      {/* 피드백 입력 — 제어형(대시보드 실행 잡)에서만. 기록형은 읽기전용. */}
      {controllable && s.state !== "none" && (
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

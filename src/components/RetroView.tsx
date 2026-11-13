"use client";

import { useCanAct } from "@/components/CanAct";
import { useCallback, useEffect, useRef, useState } from "react";
import { Typography, Empty, Button, Collapse, Badge, Space, Alert } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import FeedView from "@/components/FeedView";
import MarkdownDoc from "@/components/MarkdownDoc";
import OrderHeader from "@/components/OrderHeader";
import RetroReport from "@/components/RetroReport";
import type { RetroData } from "@/lib/retro";
import type { FeedItem, JobState } from "@/lib/jobs";

const { Paragraph, Text } = Typography;

type RetroJob = { state: JobState; feed: FeedItem[] };

/** 이미 생성된 회고 아래에 그 생성 잡(=retro-{키})의 기록을 접어서 보여준다. */
function JobRecord({ job }: { job: RetroJob }) {
  const badge =
    job.state === "running"
      ? { status: "processing" as const, text: "생성 중" }
      : job.state === "done"
      ? { status: "success" as const, text: "생성 완료" }
      : job.state === "failed"
      ? { status: "error" as const, text: "실패" }
      : { status: "default" as const, text: job.state };
  return (
    <Collapse
      style={{ marginTop: 24 }}
      items={[
        {
          key: "log",
          label: (
            <span>
              회고 생성 기록{" "}
              <Badge status={badge.status} text={badge.text} style={{ marginLeft: 8 }} />
            </span>
          ),
          children: <FeedView feed={job.feed} height={360} alwaysBottom />,
        },
      ]}
    />
  );
}

/**
 * /dobby-retro 실행 + 진행 표시(완료 시 새로고침). 최초 생성·재생성 공용.
 * jobKey는 retro-{키}. regen이면 기존 회고를 다시 작성한다. block 이 있으면 버튼을 잠근다.
 */
function RetroRunner({
  epicKey,
  label,
  regen = false,
  small = false,
  block = null,
}: {
  epicKey: string;
  label: string;
  regen?: boolean;
  small?: boolean;
  block?: string | null;
}) {
  const canAct = useCanAct();
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobKey = `retro-${epicKey}`;

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders?key=${encodeURIComponent(jobKey)}`, { cache: "no-store" });
      const s = await r.json();
      if (s.state && s.state !== "none") {
        setFeed(s.feed ?? []);
        setState(s.state === "running" ? "running" : s.state === "done" ? "done" : "failed");
      }
    } catch {
      /* 무시 */
    }
  }, [jobKey]);

  useEffect(() => {
    if (state === "running") {
      timer.current = setInterval(poll, 2000);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
    if (state === "done") {
      const t = setTimeout(() => window.location.reload(), 1200);
      return () => clearTimeout(t);
    }
  }, [state, poll]);

  // 마운트 시 "진행 중"인 잡만 복원한다. 이미 끝난(done) 잡까지 복원하면
  // done→reload 이펙트가 매 로드마다 재발동해 무한 새로고침이 된다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/orders?key=${encodeURIComponent(jobKey)}`, { cache: "no-store" });
        const s = await r.json();
        if (!cancelled && s.state === "running") {
          setFeed(s.feed ?? []);
          setState("running");
        }
      } catch {
        /* 무시 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobKey]);

  const gen = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ retro: true, key: epicKey, regen }),
      });
      if (r.ok) {
        setState("running");
        poll();
      } else {
        setError((await r.json().catch(() => null))?.error ?? "회고를 시작하지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (state === "idle") {
    if (!canAct) return null; // 읽기 전용 화면에는 생성 버튼을 그리지 않는다
    const why = block ?? error;
    return (
      <Space orientation="vertical" size={6}>
        <Button
          type={small ? "default" : "primary"}
          size={small ? "small" : "middle"}
          icon={small ? <ReloadOutlined /> : undefined}
          loading={busy}
          disabled={!!block}
          onClick={gen}
        >
          {label}
        </Button>
        {why && <Alert type="warning" showIcon title={why} style={{ fontSize: 12 }} />}
      </Space>
    );
  }
  return (
    <div>
      <Paragraph type="secondary">
        {state === "done"
          ? "생성 완료 — 새로고침합니다…"
          : state === "failed"
          ? "생성이 중단되었습니다. 로그를 확인하세요."
          : "회고 생성 중…"}
      </Paragraph>
      <FeedView feed={feed} height={360} />
    </div>
  );
}

/** /do 오더 빈 화면 안내 — 회고가 무엇을 보고 무엇을 보지 않는지. */
function V2Guide() {
  return (
    <div style={{ textAlign: "left", maxWidth: 640, margin: "0 auto", lineHeight: 1.7 }}>
      <Paragraph strong style={{ marginBottom: 4 }}>
        아직 회고가 없습니다.
      </Paragraph>
      <Paragraph style={{ marginBottom: 4 }}>
        <Text strong>주 목적은 세션 전환 손익입니다.</Text> 이 오더는 단계마다 세션을 새로 열거나 앞 세션을 이어 썼습니다.
        회고는 세션 기록을 실제로 재서, 전환마다 반대로 골랐다면 토큰과 시간이 얼마였을지 계산합니다. 비용 차이가 10% 미만이면
        더 빠른 쪽을 나은 선택으로 봅니다. 그 결과로 이어 쓰기 기준을 바꿀지 제안합니다.
      </Paragraph>
      <Paragraph style={{ marginBottom: 4 }}>
        <Text strong>보조 목적은 구현 중 판단 실수입니다.</Text> 새 버그, 검증에서 잡힌 코드 결함, 리뷰의 [blocker]와 [major]를
        봅니다. 결함마다 처음 잡힌 단계와 잡을 수 있었던 가장 이른 단계를 적습니다. 추가 설계나 범위를 넓힌 수정 지시 같은
        요구 변경은 대상이 아닙니다.
      </Paragraph>
      <Paragraph style={{ marginBottom: 4 }}>
        <Text strong>멈춘 오더에서만 할 수 있습니다.</Text> 자동 실행, 작업 중이거나 기다리는 담당자, 일하는 세션, QA 감시가
        하나라도 있으면 버튼이 잠깁니다. 진행 중에 만든 회고는 곧 낡고, 아직 쌓이는 세션을 잘못 세기 때문입니다.
      </Paragraph>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        회고는 이 오더 폴더의 회고 파일 하나만 만들고, 코드나 다른 문서는 고치지 않습니다.
      </Paragraph>
    </div>
  );
}

export default function RetroView({
  epicKey,
  title = null,
  md,
  data = null,
  block = null,
  isV2 = false,
  job = null,
  mode = null,
  worktreeRemoved = false,
  resolved = false,
  hasJira = false,
  hasDesign = false,
  hasQa = false,
  orderKind = null,
}: {
  epicKey: string;
  title?: string | null;
  md: string | null;
  data?: RetroData | null;
  block?: string | null;
  isV2?: boolean;
  job?: RetroJob | null;
  mode?: string | null;
  worktreeRemoved?: boolean;
  resolved?: boolean;
  hasJira?: boolean;
  hasDesign?: boolean;
  hasQa?: boolean;
  orderKind?: "development" | "deliverable" | "summary" | null;
}) {
  return (
    <div>
      <OrderHeader
        epicKey={epicKey}
        title={title}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        resolved={resolved}
        hasJira={hasJira}
        hasDesign={hasDesign}
        hasQa={hasQa}
        orderKind={orderKind}
      />
      {!data && !md ? (
        <Empty style={{ marginTop: 24 }} description={isV2 ? <V2Guide /> : "아직 회고가 없습니다. 이 오더에서 발생한 버그와 디자인 불일치의 원인을 정리하고 개선안을 제안합니다."}>
          <RetroRunner epicKey={epicKey} label="회고 생성" block={block} />
        </Empty>
      ) : (
        <>
          <Space style={{ margin: "12px 0" }}>
            <RetroRunner epicKey={epicKey} label="다시 생성" regen small block={block} />
          </Space>
          {data ? <RetroReport data={data} /> : <MarkdownDoc md={md ?? ""} />}
          {job && <JobRecord job={job} />}
        </>
      )}
    </div>
  );
}

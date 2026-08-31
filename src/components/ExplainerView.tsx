"use client";

import { useCanAct } from "@/components/CanAct";
import { useCallback, useEffect, useRef, useState } from "react";
import { Typography, Empty, Button, Collapse, Badge } from "antd";
import FeedView from "@/components/FeedView";
import MarkdownDoc from "@/components/MarkdownDoc";
import OrderHeader from "@/components/OrderHeader";
import type { FeedItem, JobState } from "@/lib/jobs";

const { Title, Paragraph } = Typography;

type ExplainJob = { state: JobState; feed: FeedItem[] };

/** 이미 생성된 구현 내용 아래에 그 생성 잡(=explain-{키})의 기록을 접어서 보여준다. */
function JobRecord({ job, label = "구현 내용" }: { job: ExplainJob; label?: string }) {
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
              {label} 생성 기록{" "}
              <Badge status={badge.status} text={badge.text} style={{ marginLeft: 8 }} />
            </span>
          ),
          children: <FeedView feed={job.feed} height={360} alwaysBottom />,
        },
      ]}
    />
  );
}

/** explainer.md가 없을 때: /dobby-explain 생성 실행 + 진행 표시(완료 시 새로고침). */
function GenerateExplainer({ epicKey, docLabel = "구현 내용" }: { epicKey: string; docLabel?: string }) {
  const canAct = useCanAct();
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobKey = `explain-${epicKey}`;

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
  // (탭 이동 후 돌아오면 state가 idle로 리셋돼 버튼이 다시 눌리고 중복 요청되던 문제도 함께 방지.)
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
        body: JSON.stringify({ explain: true, key: epicKey }),
      });
      if (r.ok) {
        setState("running");
        poll();
      }
    } finally {
      setBusy(false);
    }
  };

  if (state === "idle") {
    return (
      <Empty description={`아직 ${docLabel} 문서가 없습니다.${canAct ? " 산출물로 생성할 수 있습니다." : ""}`}>
        {canAct && (
          <Button type="primary" loading={busy} onClick={gen}>
            {docLabel} 생성
          </Button>
        )}
      </Empty>
    );
  }
  return (
    <div>
      <Paragraph type="secondary">
        {state === "done"
          ? "생성 완료 — 새로고침합니다…"
          : state === "failed"
          ? "생성이 중단되었습니다. 로그를 확인하세요."
          : "구현 내용 생성 중… (go-dobby dobby-explain 실행)"}
      </Paragraph>
      <FeedView feed={feed} height={360} />
    </div>
  );
}

export default function ExplainerView({
  epicKey,
  title = null,
  md,
  job = null,
  mode = null,
  worktreeRemoved = false,
  resolved = false,
  hasJira = false,
  hasDesign = false,
  orderKind = null,
}: {
  epicKey: string;
  title?: string | null;
  md: string | null;
  job?: ExplainJob | null;
  mode?: string | null;
  worktreeRemoved?: boolean;
  resolved?: boolean;
  hasJira?: boolean;
  hasDesign?: boolean;
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
        orderKind={orderKind}
      />
      {!md ? (
        <GenerateExplainer epicKey={epicKey} docLabel={orderKind === "summary" ? "작업 내용" : "구현 내용"} />
      ) : (
        <>
          <MarkdownDoc md={md} />
          {job && <JobRecord job={job} label={orderKind === "summary" ? "작업 내용" : "구현 내용"} />}
        </>
      )}
    </div>
  );
}

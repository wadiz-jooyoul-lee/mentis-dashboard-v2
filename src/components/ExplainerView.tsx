"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Breadcrumb, Typography, Empty, Button } from "antd";
import Link from "next/link";
import FeedView from "@/components/FeedView";
import type { FeedItem } from "@/lib/jobs";

const { Title, Paragraph } = Typography;

/** explainer.md가 없을 때: /dobby-explain 생성 실행 + 진행 표시(완료 시 새로고침). */
function GenerateExplainer({ epicKey }: { epicKey: string }) {
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
      <Empty description="아직 구현 내용 문서가 없습니다. 구현 산출물로 생성할 수 있습니다.">
        <Button type="primary" loading={busy} onClick={gen}>
          구현 내용 생성
        </Button>
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

// mermaid는 무거워서(≈3MB) 이 페이지에서만 동적 로드. 클라이언트 전용.
let mermaidP: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!mermaidP) {
    mermaidP = import("mermaid").then((m) => {
      m.default.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      return m.default;
    });
  }
  return mermaidP;
}

let mmSeq = 0;
function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        const id = `mmd-${++mmSeq}`;
        const { svg } = await mermaid.render(id, chart);
        if (alive && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (alive) setErr(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [chart]);
  if (err) {
    return (
      <pre style={{ background: "#fff1f0", padding: 12, borderRadius: 6, overflowX: "auto" }}>
        {chart}
      </pre>
    );
  }
  return <div ref={ref} style={{ textAlign: "center", overflowX: "auto", margin: "12px 0" }} />;
}

export default function ExplainerView({
  epicKey,
  md,
}: {
  epicKey: string;
  md: string | null;
}) {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/orchestration">오케스트레이션</Link> },
          { title: <Link href={`/orchestration/${epicKey}`}>{epicKey}</Link> },
          { title: "구현 내용" },
        ]}
      />
      {!md ? (
        <GenerateExplainer epicKey={epicKey} />
      ) : (
        <div className="markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const { className, children } = props as {
                  className?: string;
                  children?: React.ReactNode;
                };
                if (/language-mermaid/.test(className ?? "")) {
                  return <Mermaid chart={String(children).replace(/\n$/, "")} />;
                }
                return <code className={className}>{children}</code>;
              },
            }}
          >
            {md}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

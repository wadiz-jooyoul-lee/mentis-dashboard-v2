"use client";

import { useEffect, useRef } from "react";
import type { FeedItem } from "@/lib/jobs";

function feedPrefix(kind: FeedItem["kind"]): string {
  switch (kind) {
    case "tool":
      return "⚙️";
    case "result":
      return "";
    case "system":
      return "•";
    default:
      return "💬";
  }
}

function feedColor(kind: FeedItem["kind"]): string | undefined {
  switch (kind) {
    case "tool":
      return "#6cb6ff";
    case "result":
      return "#7ee787";
    case "system":
      return "#8b949e";
    default:
      return undefined;
  }
}

/** 잡 실행 로그(콘솔)를 터미널 스타일로 렌더한다. */
export default function FeedView({
  feed,
  height = 260,
}: {
  feed: FeedItem[];
  height?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 열 때 최하단(최신)으로.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // 새 로그가 붙을 때: 이미 하단 근처면 계속 따라간다(위로 스크롤 중이면 방해 안 함).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [feed]);

  return (
    <div
      ref={ref}
      style={{
        height,
        overflow: "auto",
        background: "#0b0f14",
        color: "#d6dee8",
        borderRadius: 6,
        padding: 12,
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      {feed.length === 0 ? (
        <span style={{ opacity: 0.6 }}>진행 로그 대기 중…</span>
      ) : (
        feed.map((f, i) => (
          <div
            key={i}
            style={{
              color: feedColor(f.kind),
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {feedPrefix(f.kind)} {f.text}
          </div>
        ))
      )}
    </div>
  );
}

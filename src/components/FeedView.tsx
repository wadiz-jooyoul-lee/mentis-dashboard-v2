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
  alwaysBottom = false,
}: {
  feed: FeedItem[];
  height?: number | string;
  /** true면 갱신마다 항상 최하단(기록 콘솔). false면 하단 근처일 때만 따라감(실시간). */
  alwaysBottom?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  // 첫 내용 로드 시엔 항상 최하단. 이후엔 alwaysBottom(기록)이거나 하단 근처면 따라간다.
  // 탭 전환·비동기 로드 후 레이아웃이 늦게 확정되는 경우까지 잡으려 다음 프레임에 한 번 더.
  useEffect(() => {
    const el = ref.current;
    if (!el || feed.length === 0) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    const stick = alwaysBottom || !seeded.current || nearBottom;
    seeded.current = true;
    if (!stick) return;
    el.scrollTop = el.scrollHeight;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [feed, alwaysBottom]);

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

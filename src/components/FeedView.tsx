"use client";

import type { FeedItem } from "@/lib/jobs";

const COLOR: Record<FeedItem["kind"], string> = {
  system: "#8c8c8c",
  text: "#d9d9d9",
  tool: "#69c0ff",
  result: "#95de64",
};
const PREFIX: Record<FeedItem["kind"], string> = {
  system: "•",
  text: "",
  tool: "$",
  result: "",
};

export default function FeedView({
  feed,
  height = 260,
}: {
  feed: FeedItem[];
  height?: number | string;
}) {
  return (
    <div
      style={{
        background: "#141414",
        color: "#d9d9d9",
        borderRadius: 6,
        padding: 12,
        height,
        overflowY: "auto",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12.5,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {feed.length === 0 ? (
        <span style={{ color: "#595959" }}>아직 출력이 없습니다…</span>
      ) : (
        feed.map((f, i) => (
          <div key={i} style={{ color: COLOR[f.kind] }}>
            {PREFIX[f.kind] ? <span style={{ opacity: 0.6 }}>{PREFIX[f.kind]} </span> : null}
            {f.text}
          </div>
        ))
      )}
    </div>
  );
}

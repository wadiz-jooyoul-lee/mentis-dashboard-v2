"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// mermaid는 무거워서(≈3MB) 필요할 때만 동적 로드. 클라이언트 전용.
let mermaidP: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!mermaidP) {
    mermaidP = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
        // useMaxWidth=false: 컨테이너에 맞춰 축소하지 않고 자연 크기로 그린다(글씨 가독성).
        // 넘치면 컨테이너의 overflow-x로 가로 스크롤. 폰트도 키운다.
        themeVariables: { fontSize: "16px" },
        flowchart: { useMaxWidth: false, htmlLabels: true },
        sequence: { useMaxWidth: false },
      });
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
      <pre style={{ background: "#fff1f0", padding: 12, borderRadius: 6, overflowX: "auto" }}>{chart}</pre>
    );
  }
  return <div ref={ref} style={{ textAlign: "center", overflowX: "auto", margin: "12px 0" }} />;
}

/** 마크다운 렌더러. ```mermaid 코드블록은 다이어그램으로 그린다. */
export default function MarkdownDoc({ md }: { md: string }) {
  return (
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
  );
}

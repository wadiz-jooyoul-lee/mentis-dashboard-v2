"use client";

import { Children, useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { shortPath } from "@/components/doc/parse";
import "./markdown.css";

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
    const id = `mmd-${++mmSeq}`;
    (async () => {
      try {
        const mermaid = await loadMermaid();
        // render 는 문법이 틀리면 "Syntax error in text" 그림을 body 끝(#d{id})에 붙인 채 남긴다.
        // 문법을 먼저 검사해 그 그림이 아예 만들어지지 않게 한다.
        await mermaid.parse(chart);
        const { svg } = await mermaid.render(id, chart);
        if (alive && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        document.getElementById(`d${id}`)?.remove();
        if (alive) setErr(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [chart]);
  if (err) {
    return (
      <pre className="md-mermaid-error">{chart}</pre>
    );
  }
  return <div ref={ref} className="md-mermaid" />;
}

/** 코드블록 오른쪽 위에 복사 단추를 단다. */
function CopyPre({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [done, setDone] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(ref.current?.innerText ?? "");
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };
  return (
    <div className="md-pre">
      <button type="button" className="md-copy" onClick={copy}>
        {done ? "복사됨" : "복사"}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

/**
 * 코드블록 그리기 부품 묶음. 파일 맨 위에서 한 번만 만든다 — 화면을 그릴 때마다 새로 만들면
 * React 가 다른 부품으로 보고 순서도를 지웠다 다시 그려, 높이가 흔들리며 화면이 깜박인다.
 */
function makeComponents(rich: boolean): Components {
  return {
    // 코드블록은 <pre><code>로 감싸여 오는데, mermaid는 <pre>의 배경·테두리가
    // 다이어그램을 감싸 버리고 본문 폭에도 갇힌다. 그래서 껍데기를 벗겨
    // .md-mermaid가 문서의 직계 자식이 되게 한다(전체 폭으로 그리기 위함).
    pre(props) {
      const first = Children.toArray(props.children)[0] as
        | { props?: { className?: string } }
        | undefined;
      if (/language-mermaid/.test(first?.props?.className ?? "")) {
        return <>{props.children}</>;
      }
      return rich ? <CopyPre>{props.children}</CopyPre> : <pre>{props.children}</pre>;
    },
    code(props) {
      const { className, children } = props as {
        className?: string;
        children?: React.ReactNode;
      };
      if (/language-mermaid/.test(className ?? "")) {
        return <Mermaid chart={String(children).replace(/\n$/, "")} />;
      }
      // 워크트리 절대경로는 저장소 안 경로만 보이고, 마우스를 올리면 전체 경로를 보인다.
      const short = rich && !className && typeof children === "string" ? shortPath(children) : null;
      if (short) return <code title={children as string}>{short}</code>;
      return <code className={className}>{children}</code>;
    },
  };
}
const PLAIN = makeComponents(false);
const RICH = makeComponents(true);
const REMARK = [remarkGfm];
const REHYPE = [rehypeSlug];

/**
 * 마크다운 렌더러. ```mermaid 코드블록은 다이어그램으로 그린다.
 * bare: 문서 한 편용 3열 격자(.markdown-doc)를 끈다 — 폭을 바깥 틀이 정할 때(구현 내용 화면의 구획 등).
 * rich: 코드블록 복사 단추와 워크트리 경로 줄이기를 켠다(오더 문서 화면용).
 */
export default function MarkdownDoc({ md, bare = false, rich = false }: { md: string; bare?: boolean; rich?: boolean }) {
  return (
    <div className={bare ? "markdown-body" : "markdown-body markdown-doc"}>
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={rich ? RICH : PLAIN}>
        {md}
      </ReactMarkdown>
    </div>
  );
}

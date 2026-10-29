"use client";

import MarkdownDoc from "@/components/MarkdownDoc";
import "./data-report.css";

/** 해석 문서(report.md) 한 편 — 제목, 머리 목록(측정 종류·기간), `##` 절들. */
function parse(md: string) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const meta: string[] = [];
  const sections: { title: string; body: string }[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  const lead: string[] = [];
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    if (h1 && !title && !cur) title = h1[1].trim();
    else if (h2) {
      if (cur) sections.push({ title: cur.title, body: cur.lines.join("\n").trim() });
      cur = { title: h2[1].trim(), lines: [] };
    } else if (cur) cur.lines.push(line);
    else {
      const m = line.match(/^[-*]\s+(.+)$/);
      if (m) meta.push(m[1].trim());
      else if (line.trim()) lead.push(line);
    }
  }
  if (cur) sections.push({ title: cur.title, body: cur.lines.join("\n").trim() });
  return { title, meta, lead: lead.join("\n").trim(), sections };
}

const BADGE_TONE: Record<string, string> = {
  달성: "pass",
  "일부 달성": "accent",
  미달성: "fail",
  "아직 모름": "muted",
  "수집 이상": "warn",
  "수집 확인": "accent",
  "성과 있음": "pass",
  나빠짐: "fail",
  "판단 이르다": "muted",
  "차이 없음": "muted",
};

/** 첫 절(결론) 맨 앞의 `[달성도]` 를 떼어 색 태그로 크게 그린다. */
function Summary({ body }: { body: string }) {
  const m = body.match(/^\[([^\]]+)\]\s*/);
  return (
    <div className="dr-headline">
      {m && <span className={`dr-badge dr-badge-${BADGE_TONE[m[1]] ?? "accent"}`}>{m[1]}</span>}
      <MarkdownDoc md={m ? body.slice(m[0].length) : body} bare />
    </div>
  );
}

/** 데이터 분석 해석을 공개 아티팩트와 같은 모양(큰 제목, 번호 칩 절, 카드)으로 그린다. */
export default function DataReport({ md }: { md: string }) {
  const { title, meta, lead, sections } = parse(md);
  return (
    <article className="data-report">
      <header className="dr-header">
        <div className="dr-eyebrow">데이터 분석 해석</div>
        {title && <h1>{title}</h1>}
        {meta.length > 0 && (
          <ul className="dr-meta">
            {meta.map((m) => (
              <li key={m}>
                <MarkdownDoc md={m} bare />
              </li>
            ))}
          </ul>
        )}
        {lead && <MarkdownDoc md={lead} bare />}
      </header>
      {sections.map((s, i) => (
        <section key={s.title} className="dr-section">
          <h2>
            <span className="dr-num">{String(i + 1).padStart(2, "0")}</span>
            {s.title}
          </h2>
          <div className="dr-card">
            {i === 0 && /요약|결론/.test(s.title) ? <Summary body={s.body} /> : <MarkdownDoc md={s.body} bare />}
          </div>
        </section>
      ))}
    </article>
  );
}

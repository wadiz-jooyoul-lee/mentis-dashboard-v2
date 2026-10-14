"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import MarkdownDoc from "@/components/MarkdownDoc";
import { CodeChanges, DecisionList, ImplCards, KeyValueSummary, OutcomeTable } from "./blocks";
import { parseGlossary, split, type Section } from "./parse";
import "./styled-doc.css";

/**
 * 목차를 붙일 높이 = 상단 바(64px) + 오더 머리띠(`[data-order-header]`) + 여백.
 * 머리띠는 제목 줄바꿈·버튼 수에 따라 높이가 달라져 실측한다(OtherDocsView 와 같은 방식).
 */
function useStickyTop(): number {
  const [top, setTop] = useState(272);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-order-header]");
    if (!el) return;
    const read = () => setTop(64 + Math.ceil(el.getBoundingClientRect().height) + 16);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return top;
}

/** 지금 읽고 있는 구획의 id — 고정 머리 바로 아래 선을 지난 마지막 구획. 목차에서 현재 위치를 표시하는 데 쓴다. */
function useActiveId(ids: string[], line: number): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const update = () => {
      let cur = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= line + 8) cur = el.id;
      // 페이지 끝에서는 짧은 끝 구획이 선까지 올라오지 못한다 — 목차로 고른 구획(주소의 #), 없으면 마지막 구획.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        const hash = decodeURIComponent(window.location.hash.slice(1));
        cur = els.some((el) => el.id === hash) ? hash : els[els.length - 1].id;
      }
      setActive(cur);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    // 이미 끝에 있으면 목차를 눌러도 스크롤이 일어나지 않아 주소 변경으로 다시 계산한다.
    window.addEventListener("hashchange", update);
    // 순서도가 늦게 그려지면 스크롤 없이 구획 위치가 밀리므로 본문 크기 변화에도 다시 계산한다.
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("hashchange", update);
      ro.disconnect();
    };
  }, [ids, line]);
  return active;
}

/** 상자 모양 구획(요약·알림)의 겉 class. 나머지는 일반 구획. */
const BOX: Partial<Record<Section["kind"], string>> = {
  summary: "sd-summary",
  warn: "sd-box sd-warn",
  unknown: "sd-box sd-unknown",
  skip: "sd-box sd-skip",
};

/**
 * 구획 본문 — 알아본 구획은 전용 모양으로, 형식이 맞지 않으면 원래 마크다운으로.
 * 전용 모양 부품은 훅이 없는 순수 함수라, 형식이 안 맞을 때 돌려주는 null 을 보려고 함수로 부른다.
 */
function Body({ s }: { s: Section }) {
  const md = <MarkdownDoc md={s.body} bare rich />;
  switch (s.kind) {
    case "summary":
      return KeyValueSummary({ body: s.body }) ?? md;
    case "outcome":
      return OutcomeTable({ body: s.body }) ?? md;
    case "decisions":
      return DecisionList({ body: s.body }) ?? md;
    case "code":
      return CodeChanges({ body: s.body }) ?? md;
    case "impl":
      return ImplCards({ body: s.body }) ?? md;
    case "glossary": {
      const terms = parseGlossary(s.body);
      if (!terms) return md;
      return (
        <dl className="sd-glossary">
          {terms.map((t) => (
            <div key={t.term}>
              {/* 용어에도 `코드` 표시가 붙을 수 있어 마크다운으로 그린다. */}
              <dt>
                <MarkdownDoc md={t.term} bare />
              </dt>
              <dd>
                <MarkdownDoc md={t.desc} bare />
              </dd>
            </div>
          ))}
        </dl>
      );
    }
    default:
      return md;
  }
}

/**
 * 오더 문서(구현 내용·설계·결과)를 읽기 좋게 그린다 — 왼쪽 목차, 오른쪽 본문.
 * 정해진 이름의 구획(parse.ts 의 classify)은 전용 모양으로, 그 밖은 번호 붙은 일반 구획으로 그린다.
 */
export default function StyledDoc({ md, idPrefix = "sd" }: { md: string; idPrefix?: string }) {
  const { title, preamble, sections } = useMemo(() => split(md, idPrefix), [md, idPrefix]);
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const stickyTop = useStickyTop();
  const active = useActiveId(ids, stickyTop);
  const main = sections.filter((s) => s.kind !== "followup");
  const followups = sections.filter((s) => s.kind === "followup");
  let n = 0;

  return (
    <div className="sd" style={{ "--sd-sticky": `${stickyTop}px` } as React.CSSProperties}>
      <nav className="sd-toc" aria-label="목차">
        <div className="sd-toc-inner">
          {main.map((s, i) => (
            <Fragment key={s.id}>
              {s.part && s.part !== main[i - 1]?.part && <div className="sd-toc-group">{s.part.title}</div>}
              <a href={`#${s.id}`} className={active === s.id ? "on" : undefined}>
                {s.heading}
              </a>
            </Fragment>
          ))}
          {followups.length > 0 && <div className="sd-toc-group">후속 변경</div>}
          {followups.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={active === s.id ? "on" : undefined}
              // 접혀 있는 기록으로 건너뛰면 제목만 보이므로 펼쳐 준다.
              onClick={() => document.querySelector(`#${s.id} > details`)?.setAttribute("open", "")}
            >
              <span className="sd-toc-date">{s.date!.slice(5)}</span> {s.label}
            </a>
          ))}
        </div>
      </nav>

      <article className="sd-main">
        {title && <h1 className="sd-title">{title.replace(/\s*[—–-]\s*(구현|작업) 내용$/, "")}</h1>}
        {preamble && (
          <div className="sd-preamble">
            <MarkdownDoc md={preamble} bare />
          </div>
        )}

        {main.map((s, i) => {
          const band = s.part && s.part !== main[i - 1]?.part && (
            <div className="sd-part">
              <div className="sd-part-title">{s.part.title}</div>
              {s.part.intro.trim() && <MarkdownDoc md={s.part.intro} bare rich />}
            </div>
          );
          if (s.kind === "summary") {
            return (
              <Fragment key={s.id}>
                {band}
                <section id={s.id} className={BOX.summary}>
                  <div className="sd-summary-label">{s.heading}</div>
                  <Body s={s} />
                </section>
              </Fragment>
            );
          }
          if (s.kind === "review") {
            return (
              <Fragment key={s.id}>
                {band}
                <section id={s.id} className="sd-section">
                  <details className="sd-review">
                    <summary>
                      <h2>{s.heading}</h2>
                      <span className="sd-review-hint">리뷰할 때 보는 항목입니다. 눌러서 펼칩니다</span>
                    </summary>
                    <Body s={s} />
                  </details>
                </section>
              </Fragment>
            );
          }
          const box = BOX[s.kind];
          if (!box && s.kind !== "glossary") n += 1;
          return (
            <Fragment key={s.id}>
              {band}
              <section id={s.id} className={box ?? (s.kind === "check" ? "sd-section sd-check" : "sd-section")}>
                <h2>
                  {!box && s.kind !== "glossary" && <span className="sd-num">{n}</span>}
                  {s.heading}
                </h2>
                <Body s={s} />
              </section>
            </Fragment>
          );
        })}

        {followups.length > 0 && (
          <section className="sd-followups">
            <h2>후속 변경 기록</h2>
            <ol className="sd-timeline">
              {followups.map((s, i) => (
                <li key={s.id} id={s.id}>
                  <details open={i === followups.length - 1}>
                    <summary>
                      <span className="sd-date">{s.date}</span>
                      <span className="sd-followup-title">{s.label}</span>
                    </summary>
                    <Body s={s} />
                  </details>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </div>
  );
}

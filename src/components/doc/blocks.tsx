"use client";

import MarkdownDoc from "@/components/MarkdownDoc";
import { diffLines, shortPath, parseCodeChange, splitH3, takeTable, verdictOf, DIFF_HEAD_RE, type Table, type Verdict } from "./parse";

/** 표 칸·짧은 글 한 조각을 마크다운으로 그린다. */
function Md({ md }: { md: string }) {
  return <MarkdownDoc md={md} bare rich />;
}

/** 표 앞뒤 글이 있으면 그대로 그린다. */
function Around({ md }: { md: string }) {
  return md.trim() ? <Md md={md} /> : null;
}

/** `| | |` 머리줄이 빈 2칸 표(한 장 요약)를 이름·내용 줄로 그린다. 그 밖의 모양이면 null. */
export function KeyValueSummary({ body }: { body: string }) {
  const t = takeTable(body);
  if (!t || t.table.head.length !== 2 || t.table.head.some((h) => h)) return null;
  return (
    <>
      <Around md={t.before} />
      <dl className="sd-kv">
        {t.table.rows.map((r, i) => (
          <div key={i}>
            <dt>{r[0]}</dt>
            <dd>
              <Md md={r[1] ?? ""} />
            </dd>
          </div>
        ))}
      </dl>
      <Around md={t.after} />
    </>
  );
}

const VERDICT_LABEL: Record<Verdict, string> = { same: "설계대로", added: "검증 중 추가", changed: "달라짐" };

/** 설계 대비 결과 표(설계 항목 · 구현 결과 · 설계와 달라진 점) — 줄마다 판정 꼬리표를 붙이고 위에 집계를 보인다. */
export function OutcomeTable({ body }: { body: string }) {
  const t = takeTable(body);
  if (!t || t.table.head.length < 3 || !DIFF_HEAD_RE.test(t.table.head[t.table.head.length - 1])) return null;
  const { head, rows } = t.table;
  const last = head.length - 1;
  const items = rows.map((r) => ({ r, v: verdictOf(r[0] ?? "", r[last] ?? "") }));
  const count = (v: Verdict) => items.filter((x) => x.v === v).length;
  return (
    <>
      <Around md={t.before} />
      <div className="sd-tally">
        {(["same", "changed", "added"] as const).map((v) =>
          count(v) ? (
            <span key={v} className={`sd-badge sd-${v}`}>
              {VERDICT_LABEL[v]} {count(v)}
            </span>
          ) : null,
        )}
      </div>
      <ol className="sd-outcome">
        {items.map(({ r, v }, i) => (
          <li key={i} className={`sd-${v}`}>
            <div className="sd-outcome-head">
              <span className={`sd-badge sd-${v}`}>{VERDICT_LABEL[v]}</span>
              <Md md={(r[0] ?? "").replace(/^\(검증 중 추가\)\s*/, "")} />
            </div>
            {head.slice(1, v === "same" ? last : undefined).map((h, c) => (
              <div key={h + c} className="sd-field">
                <span className="sd-field-label">{h}</span>
                <Md md={r[c + 1] ?? ""} />
              </div>
            ))}
          </li>
        ))}
      </ol>
      <Around md={t.after} />
    </>
  );
}

/** 결정과 근거 표 — 줄마다 카드 하나. 첫 칸이 카드 제목, 나머지 칸은 머리줄 이름을 붙여 보인다. */
export function DecisionList({ body }: { body: string }) {
  const t = takeTable(body);
  if (!t || t.table.head.length < 3) return null;
  return <Cards table={t.table} before={t.before} after={t.after} />;
}

function Cards({ table, before, after }: { table: Table; before: string; after: string }) {
  return (
    <>
      <Around md={before} />
      <div className="sd-cards">
        {table.rows.map((r, i) => (
          <div key={i} className="sd-card">
            <div className="sd-card-title">
              <Md md={r[0] ?? ""} />
            </div>
            {table.head.slice(1).map((h, c) => (
              <div key={h + c} className="sd-field">
                <span className="sd-field-label">{h}</span>
                <Md md={r[c + 1] ?? ""} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <Around md={after} />
    </>
  );
}

/** `### 경로 (N번째 줄 근처)` 제목에서 경로와 위치를 떼어 낸다. */
function fileTitle(heading: string): { path: string; where: string } {
  const m = heading.match(/^`?([^`(]+?)`?\s*(\(([^)]*)\))?\s*$/);
  return m ? { path: m[1], where: m[3] ?? "" } : { path: heading, where: "" };
}

/**
 * 고칠 코드 — `###` 마다 지금/고친 뒤를 한 장의 비교로 그린다. 형식이 다른 소제목은 원래 마크다운.
 * `###` 없이 구획 하나에 한 쌍만 있는 문서("## 고칠 코드 1 — …")는 구획 전체를 한 장으로 본다.
 */
export function CodeChanges({ body }: { body: string }) {
  const split = splitH3(body);
  const whole = !split.subs.length && parseCodeChange(body);
  const { intro, subs } = whole ? { intro: "", subs: [{ heading: "", body }] } : split;
  if (!subs.length) return null;
  return (
    <>
      <Around md={intro} />
      {subs.map((s, i) => {
        const ch = parseCodeChange(s.body);
        if (!ch) {
          return (
            <div key={i} className="sd-sub">
              <h3>{s.heading}</h3>
              <Md md={s.body} />
            </div>
          );
        }
        const { path, where } = fileTitle(s.heading);
        const lines = diffLines(ch.before, ch.after);
        return (
          <div key={i} className="sd-change">
            <div className="sd-change-head">
              {path ? <code title={path}>{shortPath(path) ?? path}</code> : <span>바뀌는 줄</span>}
              {where && <span className="sd-change-where">{where}</span>}
              {ch.lang && <span className="sd-change-lang">{ch.lang}</span>}
            </div>
            {ch.caption && <div className="sd-change-caption">{ch.caption}</div>}
            <pre className="sd-diff">
              {lines.map((l, k) => (
                <div key={k} className={l.op === "-" ? "del" : l.op === "+" ? "add" : undefined}>
                  <span className="sd-diff-op">{l.op}</span>
                  {l.text || " "}
                </div>
              ))}
            </pre>
            {ch.note && (
              <div className="sd-change-note">
                <Md md={ch.note} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** 구현 내용 — `###` 마다 카드 하나. 제목의 `— \`경로\`` 는 카드 머리 아래 작은 글씨로. */
export function ImplCards({ body }: { body: string }) {
  const { intro, subs } = splitH3(body);
  if (!subs.length) return null;
  return (
    <>
      <Around md={intro} />
      <div className="sd-impl">
        {subs.map((s, i) => {
          const m = s.heading.match(/^(.*?)\s*[—–-]\s*`([^`]+)`\s*$/);
          return (
            <div key={i} className="sd-card">
              <div className="sd-card-title">
                <Md md={m ? m[1] : s.heading} />
                {m && <Md md={`\`${m[2]}\``} />}
              </div>
              <Md md={s.body} />
            </div>
          );
        })}
      </div>
    </>
  );
}

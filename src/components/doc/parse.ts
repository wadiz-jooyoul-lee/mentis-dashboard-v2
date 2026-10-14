/**
 * 오더 문서(구현 내용·설계·결과) 마크다운을 화면용 구획으로 나누는 순수 함수들.
 * 형식이 예상과 다르면 null 을 돌려주고, 화면은 원래 마크다운으로 그린다.
 */

export type Kind =
  | "summary" // 한 줄 요약·한 장 요약 — 요약 상자
  | "glossary" // 용어 — 2단 표
  | "warn" // 남은 일·배포 시 주의 — 노란 상자
  | "unknown" // 확인하지 못한 것 — 주황 상자
  | "skip" // 건드리지 않을 것 — 회색 상자
  | "check" // 닫히는 조건·검증 결과 — 체크 목록
  | "review" // 리뷰 항목 — 접어 둠
  | "outcome" // 설계 대비 결과 — 판정 표
  | "decisions" // 결정과 근거 — 결정 카드
  | "code" // 고칠 코드 — 지금/고친 뒤 비교
  | "impl" // 구현 내용 — ### 단위 카드
  | "followup" // 후속 기록 — 시간줄
  | "normal";

/** 워크트리 절대경로(/Users/…/work/subtree/<워크트리>/…)면 저장소 안 경로를, 아니면 null. */
export function shortPath(text: string): string | null {
  return text.match(/^\/Users\/[^/]+\/work\/subtree\/[^/]+\/(.+)$/)?.[1] ?? null;
}

export type Part = { id: string; title: string; intro: string };
export type Section = { id: string; heading: string; body: string; kind: Kind; part: Part | null; date?: string; label?: string };

const DATE_RE = /\d{4}-\d{2}-\d{2}/;

function followupLabel(heading: string): string {
  return heading
    .replace(/^후속/, "")
    .replace(/\([^)]*(\d{4}-\d{2}-\d{2}|P\d)[^)]*\)/g, "")
    .replace(DATE_RE, "")
    .replace(/^[\s—–\-·:：,]+|[\s—–\-·:：,]+$/g, "");
}

export function classify(heading: string): Pick<Section, "kind" | "date" | "label"> {
  const date = heading.match(DATE_RE);
  if (/^후속/.test(heading) && date) return { kind: "followup", date: date[0], label: followupLabel(heading) || heading };
  if (/^(한 줄 요약|한눈에 보기|한 장 요약)/.test(heading)) return { kind: "summary" };
  if (/^용어( 풀이)?$/.test(heading)) return { kind: "glossary" };
  if (/^(남은 일|남은 것|남겨 둔 것|배포 시 주의)/.test(heading)) return { kind: "warn" };
  if (/^확인하지 못한 것/.test(heading)) return { kind: "unknown" };
  if (/^건드리지 않을 것/.test(heading)) return { kind: "skip" };
  if (/^(닫히는 조건|확인한 것|검증 결과|검증)$/.test(heading)) return { kind: "check" };
  if (/^리뷰 항목/.test(heading)) return { kind: "review" };
  if (/^(설계 대비 결과|설계와 결과 대비)/.test(heading)) return { kind: "outcome" };
  if (/^결정과 근거/.test(heading)) return { kind: "decisions" };
  if (/^고칠 코드/.test(heading)) return { kind: "code" };
  if (/^구현 내용$/.test(heading)) return { kind: "impl" };
  return { kind: "normal" };
}

const FENCE_RE = /^\s*(```|~~~)/;

/**
 * 첫 `#` 은 문서 제목, 그 뒤 `#` 은 부(1부·2부) 구분, `##` 는 구획.
 * 코드블록 안의 `#` 은 제목으로 보지 않는다.
 */
export function split(md: string, idPrefix: string): { title: string | null; preamble: string; sections: Section[] } {
  let title: string | null = null;
  const pre: string[] = [];
  const sections: Section[] = [];
  let part: Part | null = null;
  let fence = false;
  for (const line of md.split("\n")) {
    if (FENCE_RE.test(line)) fence = !fence;
    if (!fence && /^# /.test(line)) {
      if (title === null && sections.length === 0 && !part) title = line.slice(2).trim();
      else part = { id: `${idPrefix}-p${sections.length}`, title: line.slice(2).trim(), intro: "" };
      continue;
    }
    if (!fence && /^## /.test(line)) {
      const heading = line.slice(3).trim();
      sections.push({ id: `${idPrefix}-${sections.length}`, heading, body: "", part, ...classify(heading) });
      continue;
    }
    const last = sections[sections.length - 1];
    if (part && (!last || last.part !== part)) part.intro += line + "\n";
    else if (last) last.body += line + "\n";
    else pre.push(line);
  }
  return { title, preamble: pre.join("\n").trim(), sections };
}

export type Term = { term: string; desc: string };

/**
 * `- **용어**: 설명` 또는 `- 용어: 설명` 줄만으로 된 목록이면 용어 쌍으로, 하나라도 어긋나면 null.
 * `| 용어 | 뜻 |` 2칸 표도 용어 쌍으로 읽는다.
 */
export function parseGlossary(body: string): Term[] | null {
  const t = takeTable(body);
  if (t && t.table.head.length === 2 && /용어/.test(t.table.head[0]) && !t.before.trim() && !t.after.trim()) {
    return t.table.rows.map((r) => ({ term: r[0] ?? "", desc: r[1] ?? "" }));
  }
  // 구획 끝의 가로줄(---)은 내용이 아니라 건너뛴다.
  const lines = body.split("\n").filter((l) => l.trim() && !/^\s*-{3,}\s*$/.test(l));
  if (!lines.length) return null;
  const terms: Term[] = [];
  for (const l of lines) {
    const m = l.match(/^[-*]\s+\*\*(.+?)\*\*\s*[:：]\s*(.+)$/) ?? l.match(/^[-*]\s+([^:：]+?)\s*[:：]\s*(.+)$/);
    if (!m) return null;
    terms.push({ term: m[1], desc: m[2] });
  }
  return terms;
}

export type Table = { head: string[]; rows: string[][] };

/** 표 한 줄을 칸으로 나눈다. `\|` 는 칸 구분이 아니다. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

/** 본문에서 첫 번째 표를 꺼낸다. 표 앞뒤 글은 before·after 로 돌려준다. 코드블록 안의 표는 보지 않는다. */
export function takeTable(body: string): { before: string; table: Table; after: string } | null {
  const lines = body.split("\n");
  let fence = false;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) fence = !fence;
    if (!fence && /^\s*\|/.test(lines[i]) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = start + 2;
  while (end < lines.length && /^\s*\|/.test(lines[end])) end++;
  const head = cells(lines[start]);
  const rows = lines.slice(start + 2, end).map(cells);
  return { before: lines.slice(0, start).join("\n"), table: { head, rows }, after: lines.slice(end).join("\n") };
}

/** `### 소제목` 단위로 나눈다. 첫 `###` 앞의 글은 intro. */
export function splitH3(body: string): { intro: string; subs: { heading: string; body: string }[] } {
  const subs: { heading: string; body: string }[] = [];
  const intro: string[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (FENCE_RE.test(line)) fence = !fence;
    if (!fence && /^### /.test(line)) {
      subs.push({ heading: line.slice(4).trim(), body: "" });
      continue;
    }
    if (subs.length) subs[subs.length - 1].body += line + "\n";
    else intro.push(line);
  }
  return { intro: intro.join("\n").trim(), subs };
}

export type CodeChange = { before: string[]; after: string[]; lang: string; caption: string; note: string };

/**
 * `지금` 코드블록과 `고친 뒤` 코드블록 한 쌍을 찾는다. 나머지 글(왜 — 문단 등)은 note.
 * `고친 뒤` 가 없으면 null(원래 마크다운으로 그린다).
 */
export function parseCodeChange(body: string): CodeChange | null {
  const lines = body.split("\n");
  const rest: string[] = [];
  let before: string[] | null = null;
  let after: string[] | null = null;
  let lang = "";
  let caption = "";
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(```|~~~)(\S*)/);
    if (!open) {
      rest.push(lines[i]);
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith(open[1])) j++;
    const code = lines.slice(i + 1, j);
    // 코드블록 바로 앞의 글줄(빈 줄 제외)이 "지금"·"고친 뒤" 꼬리표인지 본다.
    let k = rest.length - 1;
    while (k >= 0 && !rest[k].trim()) k--;
    const tag = k >= 0 ? rest[k].trim().replace(/\*/g, "") : "";
    if (/^지금/.test(tag) && !before) {
      before = code;
      caption = tag.replace(/^지금\s*:?\s*/, "");
      rest.splice(k);
    } else if (/^고친 뒤/.test(tag) && !after) {
      after = code;
      rest.splice(k);
    } else {
      rest.push(...lines.slice(i, j + 1));
    }
    lang ||= open[2];
    i = j;
  }
  if (!after) return null;
  return { before: before ?? [], after, lang, caption, note: rest.join("\n").trim() };
}

export type DiffLine = { op: " " | "-" | "+"; text: string };

/** 줄 단위 최장 공통 부분열(LCS)로 바뀐 줄만 -·+ 로 표시한다. */
export function diffLines(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: "-", text: a[i++] });
    else out.push({ op: "+", text: b[j++] });
  }
  while (i < n) out.push({ op: "-", text: a[i++] });
  while (j < m) out.push({ op: "+", text: b[j++] });
  return out;
}

export type Verdict = "same" | "added" | "changed";

/** 설계 대비 결과 표의 마지막 칸("설계와 달라진 점"·"차이") 이름인지. */
export const DIFF_HEAD_RE = /달라|차이/;

/** 설계 대비 결과 표의 줄을 판정한다 — 항목 이름의 "(검증 중 추가)" 또는 "설계와 달라진 점" 칸의 첫 낱말로. */
export function verdictOf(item: string, diff: string): Verdict {
  const d = diff.replace(/\*/g, "").trim();
  if (/^\(?검증 중 추가\)?/.test(item) || /^(설계에(는)? 없(던|었)|추가됨|설계 뒤 추가)/.test(d)) return "added";
  // "없음", "없음. 다만 …"처럼 첫 낱말로 판정한다.
  if (/^(없음|없습니다|그대로|일치|설계대로|동일|✅|-|—)([\s.,(—]|$)/.test(d)) return "same";
  return "changed";
}

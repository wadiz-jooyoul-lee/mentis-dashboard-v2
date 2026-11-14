/**
 * 리뷰 결과 파일을 지적 카드로 나눈다. (순수 함수, node 의존 없음)
 * 형식은 go-dobby steps/review.md 가 기준이다: 지적마다 `## [blocker|major|minor|nit] 제목` 으로 시작하고,
 * 본문에 `- 설계와 구현: 설계대로 구현됨` 또는 `- 설계와 구현: 구현이 설계와 다름` 한 줄이 있다(옛 리뷰에는 없다).
 */

export type Severity = "blocker" | "major" | "minor" | "nit";

export type ReviewFinding = {
  type: "finding";
  severity: Severity;
  title: string;
  /** "설계와 구현" 줄의 값. same 설계대로 구현됨 · diff 구현이 설계와 다름 · null 줄이 없음(또는 모르는 값) */
  fit: "same" | "diff" | null;
  /** 그 줄에 적힌 글 그대로. 줄이 없으면 빈 문자열 */
  fitText: string;
  /** 그 줄을 뺀 본문(근거, 재현 조건, 수정 제안) */
  body: string;
};

/** 지적 카드가 아닌 글(머리말, "확인함 — 문제 없음" 같은 절). 원래 마크다운 그대로 그린다. */
export type ReviewText = { type: "text"; md: string };

export type ReviewDoc = { blocks: (ReviewFinding | ReviewText)[]; findings: ReviewFinding[] };

const CARD_RE = /^##\s*\[(blocker|major|minor|nit)\]\s*(.*)$/i;
const FIT_RE = /^\s*[-*]\s*\*{0,2}설계와 구현\*{0,2}\s*[:：]\s*(.+?)\s*$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** 막는 지적인가(blocker·major). 이 지적이 남아 있으면 다음 단계로 가지 못한다. */
export const isBlocking = (s: Severity): boolean => s === "blocker" || s === "major";

/** 지적 카드가 하나도 없으면 null — 화면은 원래 마크다운으로 그린다. */
export function parseReview(md: string): ReviewDoc | null {
  const blocks: (ReviewFinding | ReviewText)[] = [];
  let cur: ReviewFinding | ReviewText | null = null;
  let fence = false;
  const lines: string[] = [];
  const flush = () => {
    if (!cur) return;
    const text = lines.join("\n").trim();
    if (cur.type === "finding") cur.body = text;
    else cur.md = text;
    if (cur.type === "finding" || text) blocks.push(cur);
    lines.length = 0;
  };
  for (const line of md.split("\n")) {
    if (FENCE_RE.test(line)) fence = !fence;
    const card = !fence ? line.match(CARD_RE) : null;
    if (card) {
      flush();
      cur = { type: "finding", severity: card[1].toLowerCase() as Severity, title: card[2].trim(), fit: null, fitText: "", body: "" };
      continue;
    }
    if (!fence && /^##\s/.test(line)) {
      flush();
      cur = { type: "text", md: "" };
      lines.push(line);
      continue;
    }
    cur ??= { type: "text", md: "" };
    if (cur.type === "finding" && !cur.fitText && !fence) {
      const fit = line.match(FIT_RE);
      if (fit) {
        cur.fitText = fit[1].replace(/[`*]/g, "").trim();
        cur.fit = /설계대로 구현됨/.test(cur.fitText) ? "same" : /구현이 설계와 다름/.test(cur.fitText) ? "diff" : null;
        continue;
      }
    }
    lines.push(line);
  }
  flush();
  const findings = blocks.filter((b): b is ReviewFinding => b.type === "finding");
  return findings.length ? { blocks, findings } : null;
}

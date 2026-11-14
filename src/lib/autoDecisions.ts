/**
 * 스스로 정한 결정 — 사람의 확정 없이 기획자가 정한 것. (순수 함수, node 의존 없음)
 * 설계 문서 `## 결정과 근거` 표에서 `왜` 칸이 `자동 결정 —` 으로 시작하는 줄이다(go-dobby steps/triage.md 가 그렇게 적는다).
 */
import { split, takeTable } from "@/components/doc/parse";

/** 칸 맨 앞의 `자동 결정 —` 표시. 굵은 글씨 표시(`**`)가 붙어 있어도 읽는다. */
export const AUTO_DECISION_RE = /^(\*{0,2})\s*자동 결정\s*(\*{0,2})\s*[—–-]\s*/;

export type AutoDecision = {
  /** 무엇을 정했나(표의 첫 칸) */
  what: string;
  /** 고른 답(둘째 칸). 표가 세 칸보다 좁으면 빈 문자열 */
  pick: string;
  /** 이유 — `자동 결정 —` 을 뗀 나머지 */
  why: string;
  /** 그 밖의 칸(버린 안 등): 머리줄 이름과 값 */
  rest: { label: string; value: string }[];
  /** 제품 동작이 달라지는 선택이라 사람이 한 번 봐야 하는가("확인해 보세요"가 적혀 있다) */
  check: boolean;
};

/** 칸에서 `자동 결정 —` 표시를 뗀다. 칸 전체가 굵은 글씨면 여는 표시는 남긴다. */
export function stripAutoMark(cell: string): string {
  return cell.replace(AUTO_DECISION_RE, (_m, open: string, close: string) => (open && !close ? open : "")).trim();
}

/** 표의 한 줄에서 `자동 결정 —` 으로 시작하는 칸의 자리. 없으면 -1. */
export function autoDecisionCell(row: string[]): number {
  return row.findIndex((c, i) => i > 0 && AUTO_DECISION_RE.test(c));
}

/** `## 결정과 근거` 구획의 본문에서 스스로 정한 결정만 뽑는다. 본문에 표가 여럿이면 모두 본다. */
export function autoDecisionsInBody(body: string): AutoDecision[] {
  const out: AutoDecision[] = [];
  let rest = body;
  for (let guard = 0; guard < 20; guard++) {
    const t = takeTable(rest);
    if (!t) break;
    const { head, rows } = t.table;
    for (const r of rows) {
      const wi = autoDecisionCell(r);
      if (wi < 0) continue;
      out.push({
        what: r[0] ?? "",
        pick: wi > 1 ? r[1] ?? "" : "",
        why: stripAutoMark(r[wi]),
        rest: head
          .map((h, i) => ({ label: h, value: r[i] ?? "" }))
          .filter((x, i) => i > (wi > 1 ? 1 : 0) && i !== wi && x.value && x.value !== "-" && x.value !== "—"),
        check: r.some((c) => /확인해 보세요/.test(c)),
      });
    }
    rest = t.after;
  }
  return out;
}

/** 설계 문서 전체에서 스스로 정한 결정을 뽑는다. 문서가 없으면 빈 배열. */
export function autoDecisions(designMd: string | null): AutoDecision[] {
  if (!designMd || !/자동 결정/.test(designMd)) return [];
  return split(designMd, "d")
    .sections.filter((s) => s.kind === "decisions")
    .flatMap((s) => autoDecisionsInBody(s.body));
}

/** PR 변경요청으로 설계를 바꾼 횟수 — 설계 문서의 `## 변경 N — PR 리뷰 지적` 절 수(go-dobby dobby_v2_pr_fixes 와 같다). */
export function prRedesignCount(designMd: string | null): number {
  return designMd?.match(/^## 변경 [0-9]+ — PR 리뷰 지적/gm)?.length ?? 0;
}

/** 변경요청으로 설계를 바꿀 수 있는 횟수. 넘으면 자동 실행이 사람에게 묻는다. */
export const PR_REDESIGN_MAX = 3;

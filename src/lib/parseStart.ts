/** issue-start 의 status.md 파싱 (순수 함수). */
import { field, fieldLine, dateField, findTable, columnIndex } from "@/lib/md";

export type Worktree = { repo: string; branch: string; path: string };
export type StartState =
  | "착수"
  | "분석완료"
  | "구현중"
  | "리뷰중"
  | "수정중"
  | "해결됨"
  | "unknown";
/** 단독 issue-start(standalone) vs work-dobby 하위이슈(orchestrated) */
export type StartOrigin = "standalone" | "orchestrated";

export type IssueStart = {
  key: string;
  type: string | null;
  title: string | null;
  jira: string | null;
  jiraTransition: string | null;
  source: string | null;
  origin: StartOrigin;
  state: StartState;
  startedAt: string | null;
  updatedAt: string | null;
  base: string | null;
  resolvedEvidence: string | null;
  worktrees: Worktree[];
  causeLocation: string | null;
  fixDesign: string | null;
  /** 이슈/상태/워크트리 섹션을 뺀 나머지 본문(분석 상세·수정 설계·결정 이력 등) */
  detailMarkdown: string;
  /** status.md 원문 전체 */
  raw: string;
};

const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : "");

/**
 * 상단에서 구조화해 보여주는 섹션(이슈/상태/워크트리)과 제목을 제거하고
 * 나머지 본문만 남긴다. 스킬이 자유형으로 작성한 분석/설계 내용을 보존한다.
 */
function extractDetailMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let started = false; // 첫 ## 를 만나기 전(제목/서두)은 버린다
  let skipSection = false;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)/);
    if (m) {
      started = true;
      const h = m[1].replace(/\*/g, "").trim();
      // 이슈/상태/워크트리(상단 구조화)와 분석 요약(구조화 카드로 표시)은 제외.
      // "분석 상세" 등 그 외 자유형 섹션은 보존.
      skipSection = /^(이슈|상태|워크트리|분석\s*요약)/.test(h);
      if (!skipSection) out.push(line);
      continue;
    }
    if (!started || skipSection) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseStart(md: string): IssueStart {
  const stateVal = field(md, "상태") ?? "";
  // status.md 상태 흐름: 착수 → 분석완료 → 구현중 → 리뷰중 → 수정중 → 해결됨
  // 우선순위 주의: "분석완료"는 "완료" 포함이나 해결됨과 구분, "구현완료"는 구현중과 다름
  const state: StartState = stateVal.includes("해결됨")
    ? "해결됨"
    : stateVal.includes("수정") || stateVal.includes("반영")
    ? "수정중"
    : stateVal.includes("리뷰")
    ? "리뷰중"
    : stateVal.includes("구현중")
    ? "구현중"
    : stateVal.includes("분석완료")
    ? "분석완료"
    : stateVal.includes("착수")
    ? "착수"
    : "unknown";

  const source = fieldLine(md, "작성 출처");
  const origin: StartOrigin =
    source && source.includes("agent-start") ? "orchestrated" : "standalone";

  const worktrees: Worktree[] = [];
  const t = findTable(md, "repo", "브랜치", "경로");
  if (t) {
    const ri = columnIndex(t.headers, "repo");
    const bi = columnIndex(t.headers, "브랜치");
    const pi = columnIndex(t.headers, "경로");
    for (const row of t.rows) {
      worktrees.push({ repo: at(row, ri), branch: at(row, bi), path: at(row, pi) });
    }
  }

  return {
    key: field(md, "키") ?? "",
    type: field(md, "타입"),
    title: fieldLine(md, "제목"),
    jira: fieldLine(md, "Jira"),
    jiraTransition: fieldLine(md, "Jira 상태 전환"),
    source,
    origin,
    state,
    startedAt: dateField(md, "시작"),
    updatedAt: dateField(md, "갱신"),
    base: field(md, "베이스"),
    resolvedEvidence: fieldLine(md, "해결 근거"),
    worktrees,
    causeLocation: field(md, "원인 위치"),
    fixDesign: fieldLine(md, "수정 설계"),
    detailMarkdown: extractDetailMarkdown(md),
    raw: md,
  };
}

export function startStateBadge(state: StartState): {
  status: "success" | "processing" | "warning" | "default";
  text: string;
} {
  switch (state) {
    case "해결됨":
      return { status: "success", text: "해결됨" };
    case "수정중":
      return { status: "warning", text: "수정중" };
    case "리뷰중":
      return { status: "warning", text: "리뷰중" };
    case "구현중":
      return { status: "processing", text: "구현중" };
    case "분석완료":
      return { status: "processing", text: "분석완료" };
    case "착수":
      return { status: "default", text: "착수" };
    default:
      return { status: "default", text: "-" };
  }
}

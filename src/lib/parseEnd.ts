/** issue-end 의 summary.md 파싱 (순수 함수). */
import { field, dateField, findTable, columnIndex } from "@/lib/md";

export type EndAction = "제거" | "유지" | "unknown";
export type EndWorktree = {
  repo: string;
  branch: string;
  path: string;
  action: EndAction;
};

export type IssueEnd = {
  key: string;
  type: string | null;
  title: string | null;
  jira: string | null;
  finalStatus: string | null;
  processedAt: string | null;
  worktreeAction: EndAction;
  worktrees: EndWorktree[];
  causeLocation: string | null;
  fixDesign: string | null;
};

const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : "");

function toAction(v: string): EndAction {
  // 값은 "{처리} — {설명}" 형태라 설명에 반대 단어가 섞일 수 있다.
  // 맨 앞 한글 단어(실제 처리)만 본다. 예: "유지 (제거 대기)" → 유지.
  const head = v.trim().match(/^[가-힣]+/)?.[0] ?? "";
  if (head === "제거") return "제거";
  if (head === "유지") return "유지";
  // 앞 단어로 판별 실패 시: 유지 우선(제거는 명시적일 때만)
  if (v.includes("유지")) return "유지";
  if (v.includes("제거")) return "제거";
  return "unknown";
}

export function parseEnd(md: string): IssueEnd {
  const worktrees: EndWorktree[] = [];
  const t = findTable(md, "repo", "경로", "처리");
  if (t) {
    const ri = columnIndex(t.headers, "repo");
    const bi = columnIndex(t.headers, "브랜치");
    const pi = columnIndex(t.headers, "경로");
    const ai = columnIndex(t.headers, "처리");
    for (const row of t.rows) {
      worktrees.push({
        repo: at(row, ri),
        branch: at(row, bi),
        path: at(row, pi),
        action: toAction(at(row, ai)),
      });
    }
  }

  // "종료 (statusCategory: done)" → "종료"
  const finalStatusRaw = field(md, "최종 상태");
  const finalStatus = finalStatusRaw
    ? finalStatusRaw.replace(/\s*\(.*?\)\s*$/, "").trim()
    : null;

  return {
    key: field(md, "키") ?? "",
    type: field(md, "타입"),
    title: field(md, "제목"),
    jira: field(md, "Jira"),
    finalStatus,
    processedAt: dateField(md, "처리 일시") ?? field(md, "처리 일시"),
    worktreeAction: toAction(field(md, "워크트리 처리") ?? ""),
    worktrees,
    causeLocation: field(md, "원인 위치"),
    fixDesign: field(md, "수정 설계"),
  };
}

/** 최종 상태(Jira done 상태명)를 값에 따라 색으로 구분한다. */
export function finalStatusColor(name: string | null): string {
  if (!name) return "default";
  if (/해결|resolved|fixed/i.test(name)) return "blue";
  if (/종료|완료|closed|done/i.test(name)) return "green";
  return "green"; // 기타 done 상태
}

export function endActionBadge(action: EndAction): {
  color: string;
  text: string;
} {
  switch (action) {
    case "제거":
      return { color: "green", text: "제거" };
    case "유지":
      return { color: "orange", text: "유지" };
    default:
      return { color: "default", text: "-" };
  }
}

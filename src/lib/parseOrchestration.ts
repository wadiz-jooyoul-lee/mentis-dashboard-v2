/** work-dobby orchestration.md 파싱 (순수 함수). */
import { findTable, columnIndex } from "@/lib/md";

/** 상태는 자유 문자열(스킬이 새 값을 써도 사라지지 않게). 알려진 값은 정규화. */
export type AgentState = string;

export type AgentRow = {
  agent: string;
  issue: string;
  branch: string;
  state: AgentState;
  round: string;
  updatedAt: string;
  /** 작업 시작 시각(활성 상태 진입). 정체 감지는 이 값 기준. 없거나 날짜만이면 감지 안 함. */
  startedAt: string;
};

export type ScopeRow = { area: string; owner: string; reason: string };
export type EventRow = { time: string; text: string };

export type Orchestration = {
  epicKey: string;
  mode: string | null;
  agents: AgentRow[];
  scope: ScopeRow[];
  conflicts: string;
  events: EventRow[];
  /** 제목·에이전트 상태·이벤트 로그를 뺀 나머지 본문(상단 요약·범위배분·공유계약·충돌 등) */
  restMarkdown: string;
};

const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : "");

/**
 * 정식 상태 흐름 순서(칸반 고정 열). 각 에이전트는 자기 상태 집합 안에서만 움직인다.
 * 구현·산출: 대기→구현→완료 / 분석·감사: 대기→분석→완료 / 리뷰: 대기→리뷰→완료 / 인라인: 대기→분석→구현→완료
 * 그 외(정의 밖) 값은 뒤에 붙어 사라지지 않는다.
 */
export const STATE_ORDER: string[] = ["대기", "분석", "구현", "리뷰", "완료"];

/**
 * 상태 정규화 → 5개(대기·분석·구현·리뷰·완료)로 접는다. 옛 상태값도 여기서 매핑:
 * 분석중→분석 / 구현중·산출중·수정중→구현 / 진행중·리뷰중→리뷰 / 재통합대기·(분석)완료→완료.
 */
export function normAgentState(v: string): AgentState {
  const s = v.replace(/\*/g, "").trim();
  const base = s.split(/[(（]/)[0].trim(); // "구현(round-3)" → "구현"
  if (s.includes("완료")) return "완료"; // 완료·분석완료·구현완료
  if (s.includes("재통합")) return "완료"; // 재통합대기 → 완료(리뷰 통과·통합 단계)
  if (s.includes("수정") || s.includes("반영")) return "구현"; // 수정 → 구현
  if (s.includes("리뷰") || s.includes("진행")) return "리뷰"; // 리뷰·리뷰중·진행중 → 리뷰
  if (s.includes("산출") || s.includes("구현")) return "구현"; // 산출·구현 → 구현
  if (s.includes("분석")) return "분석";
  if (s.includes("대기")) return "대기";
  return base || "미상"; // 모르는 값도 라벨 그대로(사라지지 않게)
}

/** 데이터에 실제 존재하는 상태들을 흐름 순서대로 정렬(모르는 값은 뒤). */
export function orderStates(states: string[]): string[] {
  const uniq = Array.from(new Set(states));
  const known = STATE_ORDER.filter((s) => uniq.includes(s));
  const extra = uniq.filter((s) => !STATE_ORDER.includes(s));
  return [...known, ...extra];
}

/** "## heading" 아래 다음 "## " 전까지의 본문을 반환. */
function sectionBody(md: string, headingKeyword: string): string {
  const lines = md.split("\n");
  let i = lines.findIndex(
    (l) => /^##\s/.test(l) && l.replace(/[#*]/g, "").includes(headingKeyword)
  );
  if (i < 0) return "";
  const out: string[] = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^##\s/.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out.join("\n").trim();
}

/** GFM 표가 헤딩/문단 바로 뒤에 붙어 있으면 표로 인식되도록 앞에 빈 줄을 넣는다. */
function ensureTableSpacing(lines: string[]): string[] {
  const res: string[] = [];
  const isRow = (l: string) => /^\s*\|/.test(l);
  for (const l of lines) {
    const prev = res[res.length - 1];
    if (isRow(l) && prev !== undefined && prev.trim() !== "" && !isRow(prev)) {
      res.push("");
    }
    res.push(l);
  }
  return res;
}

/** 제목(H1)·"에이전트 상태"·"이벤트 로그" 섹션을 뺀 나머지 마크다운. */
function extractRest(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let skipSection = false;
  for (const line of lines) {
    if (/^#\s/.test(line)) continue; // H1 제목 제거(상단에 별도 표시)
    if (/^##\s/.test(line)) {
      const h = line.replace(/[#*]/g, "").trim();
      skipSection = h.includes("에이전트 상태") || h.includes("이벤트 로그");
      if (!skipSection) out.push(line);
      continue;
    }
    if (!skipSection) out.push(line);
  }
  return ensureTableSpacing(out).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseOrchestration(md: string): Orchestration {
  const lines = md.split("\n");
  const titleLine = lines.find((l) => /^#\s/.test(l)) ?? "";
  const epicKey = (titleLine.match(/^#\s+([A-Za-z0-9-]+)/)?.[1] ?? "").trim();

  // 에이전트 상태 표
  const agents: AgentRow[] = [];
  const aT = findTable(md, "에이전트", "상태", "슬러그");
  if (aT) {
    // 실제 go-dobby orchestration.md는 이름 컬럼을 "슬러그"로 쓰기도 한다 → 둘 다 인식.
    const iAgent = columnIndex(aT.headers, "에이전트", "슬러그");
    const iIssue = columnIndex(aT.headers, "이슈");
    const iBranch = columnIndex(aT.headers, "브랜치");
    const iState = columnIndex(aT.headers, "상태");
    const iRound = columnIndex(aT.headers, "라운드");
    const iUpd = columnIndex(aT.headers, "갱신");
    const iStart = columnIndex(aT.headers, "착수", "시작");
    for (const r of aT.rows) {
      agents.push({
        agent: at(r, iAgent),
        issue: at(r, iIssue),
        branch: at(r, iBranch),
        state: normAgentState(at(r, iState)),
        round: at(r, iRound),
        updatedAt: at(r, iUpd),
        startedAt: at(r, iStart),
      });
    }
  }

  // 범위 배분 표
  const scope: ScopeRow[] = [];
  const sT = findTable(md, "영역", "담당");
  if (sT) {
    const iArea = columnIndex(sT.headers, "영역", "파일");
    const iOwner = columnIndex(sT.headers, "담당");
    const iReason = columnIndex(sT.headers, "근거");
    for (const r of sT.rows) {
      scope.push({
        area: at(r, iArea),
        owner: at(r, iOwner),
        reason: at(r, iReason),
      });
    }
  }

  // 실행 모드: "## 실행 모드: 병렬 …" 헤딩 형태 또는 불릿 필드 형태
  // ("- **실행 모드**: A (대화형)" / "- 실행 모드: A(대화형)") 모두 수용(스킬 드리프트 방어).
  let mode: string | null = null;
  const modeHeading = lines.find(
    (l) => /^##\s/.test(l) && l.includes("실행 모드")
  );
  if (modeHeading) {
    const after = modeHeading.split(/실행 모드\s*[:：]?/)[1]?.trim();
    mode = after || sectionBody(md, "실행 모드").split("\n")[0] || null;
  }
  if (!mode) {
    const m = md.match(/^\s*[-*]?\s*\*{0,2}실행 모드\*{0,2}\s*[:：]\s*(.+)$/m);
    if (m) mode = m[1].trim().replace(/^`|`$/g, "") || null;
  }

  const conflicts = sectionBody(md, "충돌");

  // 이벤트 로그: "- {일시} {내용}". 날짜는 필수, 시각(HH:MM[:SS])은 선택 —
  // 시각 없이 날짜만 있는 이벤트도 수용한다(스킬 드리프트·외부 데이터 방어).
  const events: EventRow[] = [];
  for (const line of sectionBody(md, "이벤트 로그").split("\n")) {
    const m = line.match(
      /^-\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?\s*(.*)$/
    );
    if (m) {
      const time = m[2] ? `${m[1]} ${m[2]}` : m[1];
      events.push({ time, text: m[3].trim() });
    }
  }
  events.reverse(); // 최신 먼저

  return {
    epicKey: epicKey || "",
    mode,
    agents,
    scope,
    conflicts,
    events,
    restMarkdown: extractRest(md),
  };
}

const STATE_COLOR: Record<string, string> = {
  대기: "#bfbfbf",
  분석: "cyan",
  구현: "blue",
  리뷰: "gold",
  완료: "green",
};

/** 상태 → Badge 색(프리셋/헥스) + 라벨 */
export function agentStateBadge(state: AgentState): {
  color: string;
  text: string;
} {
  return { color: STATE_COLOR[state] ?? "#d9d9d9", text: state || "-" };
}

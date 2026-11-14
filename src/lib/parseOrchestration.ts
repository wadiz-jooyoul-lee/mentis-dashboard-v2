/** work-dobby orchestration.md 파싱 (순수 함수). */
import { findTable, columnIndex } from "@/lib/md";

/** 상태는 자유 문자열(스킬이 새 값을 써도 사라지지 않게). 알려진 값은 정규화. */
export type AgentState = string;

export type AgentRow = {
  /** 파일·로그용 식별자(슬러그). 계약·리뷰·agent-logs 매칭에 쓴다. */
  agent: string;
  /** 사람이 읽는 롤 표시명(개발자·리뷰어·분석/개발자 등). 없으면 대시보드가 슬러그로 표시. */
  name?: string;
  /** 현재 작업 한 줄(이름 호버 툴팁). 없으면 툴팁 없음. */
  desc?: string;
  issue: string;
  branch: string;
  state: AgentState;
  round: string;
  updatedAt: string;
  /** 이 상태가 된 시각. 작업중·기다림의 경과는 이 값부터 잰다. */
  startedAt: string;
  /** 사람 할 일(사람 차례·막힘일 때만). 명령이나 하는 곳. */
  todo?: string;
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
 * 칸반 고정 열. 상태는 "다음에 누가 움직이나"로 갈린다(대기·작업중·기다림·사람 차례·막힘·완료).
 * 정의 밖 값은 뒤에 붙어 사라지지 않는다.
 */
export const HUMAN_COL = "사람 차례 · 막힘";
export const STATE_ORDER: string[] = ["대기", "작업중", "기다림", HUMAN_COL, "완료"];

/** 칸반 열. 사람 차례와 막힘은 둘 다 사람이 움직여야 해서 한 열에 그린다. */
export function boardColumn(state: AgentState): string {
  return state === "사람 차례" || state === "막힘" ? HUMAN_COL : state;
}

/** /do 오더의 담당자 다섯. 개발자 슬러그는 오더마다 달라 이름으로 찾는다. */
export const FIVE_ROLES: { slug: string | null; name: string }[] = [
  { slug: "analysis-agent", name: "기획자" },
  { slug: null, name: "개발자" },
  { slug: "review-agent", name: "리뷰어" },
  { slug: "deploy-agent", name: "배포담당" },
  { slug: "test-agent", name: "테스터" },
];

/** 단계값 → 그 단계를 맡는 담당자 이름(단계값은 "지금 누구 차례인가"다). */
export function phaseOwner(phase: string): string | null {
  switch (phase) {
    case "설계": case "설계확인": case "실패분석": case "보류": case "분석": return "기획자";
    case "구현": case "수정": case "통합": return "개발자";
    case "리뷰": return "리뷰어";
    case "배포": return "배포담당";
    case "검증": return "테스터";
    default: return null;
  }
}

/** 개발 담당 행인가. 분석과 개발을 나누기 전 오더는 이름이 "분석/개발자"다. */
export function isDevRole(name: string | undefined): boolean {
  return name === "개발자" || name === "분석/개발자";
}

/**
 * 상태 정규화 → 6개(대기·작업중·기다림·사람 차례·막힘·완료). go-dobby dobby_norm_state 와 같은 규칙이다.
 * 옛 값(분석·구현·리뷰·검증·진행·수정·반영·산출)은 작업중, 재통합은 완료로 접는다.
 */
export function normAgentState(v: string): AgentState {
  const s = v.replace(/\*/g, "").trim();
  const base = s.split(/[(（]/)[0].trim(); // "구현(round-3)" → "구현"
  if (s.includes("완료") || s.includes("재통합")) return "완료";
  if (s.includes("막힘") || s.includes("막혔")) return "막힘";
  if (s.includes("사람")) return "사람 차례";
  if (s.includes("기다림")) return "기다림";
  if (/작업중|수정|반영|리뷰|산출|구현|분석|진행|검증/.test(s)) return "작업중";
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
    const iName = columnIndex(aT.headers, "이름");
    const iDesc = columnIndex(aT.headers, "설명");
    const iIssue = columnIndex(aT.headers, "이슈");
    const iBranch = columnIndex(aT.headers, "브랜치");
    const iState = columnIndex(aT.headers, "상태");
    const iRound = columnIndex(aT.headers, "라운드");
    const iUpd = columnIndex(aT.headers, "갱신");
    const iStart = columnIndex(aT.headers, "착수", "시작");
    const iTodo = columnIndex(aT.headers, "사람 할 일");
    for (const r of aT.rows) {
      agents.push({
        agent: at(r, iAgent),
        name: at(r, iName) || undefined,
        desc: at(r, iDesc) || undefined,
        issue: at(r, iIssue),
        branch: at(r, iBranch),
        state: normAgentState(at(r, iState)),
        round: at(r, iRound),
        updatedAt: at(r, iUpd),
        startedAt: at(r, iStart),
        todo: at(r, iTodo) || undefined,
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
  작업중: "blue",
  기다림: "cyan",
  "사람 차례": "orange",
  막힘: "red",
  [HUMAN_COL]: "orange",
  완료: "green",
};

/** 상태 → Badge 색(프리셋/헥스) + 라벨 */
export function agentStateBadge(state: AgentState): {
  color: string;
  text: string;
} {
  return { color: STATE_COLOR[state] ?? "#d9d9d9", text: state || "-" };
}

/** 오더 머리 한 줄 "지금 움직이는 쪽". tone 은 색, cmd 는 사람이 칠 명령(복사 단추). */
export type Mover = {
  tone: "blocked" | "human" | "working" | "auto" | "after";
  text: string;
  cmd?: string;
  /** 이 줄 때문에 사람 차례로 바꿔 보이는 카드(세션 끊김·자동 실행 없음). */
  slug?: string;
};

const HEARTBEAT_MIN = 5;

/**
 * 담당자 상태표·세션 생존·자동 실행·릴리즈 노트를 맞춰 지금 누가 움직이는지 고른다. 처음 맞는 규칙 하나다.
 * 1 막힘 · 답 없는 질문 · 2 사람 차례 · QA 감시(끊김·진행 중) · 3 작업중+세션 · 4 작업중인데 세션 없음(끊김) · 5 기다림(심박 5분)
 * 6·7 단계 담당자가 대기면 자동 실행 유무로 · 8~10 검증 통과 뒤 릴리즈 노트.
 */
export function whoMoves(p: {
  key: string;
  agents: AgentRow[];
  phase: string;
  sessions: Record<string, string>;
  autoRunning: boolean;
  releaseDates: string[];
  /** QA 감시 진행. 진행 중이면 단계와 상관없이 QA 로 안내한다. */
  qa?: "active" | "lost" | null;
  /** 아직 답을 받지 못한 질문의 제목. 있으면 누가 일하는 중이 아니라 사람의 답을 기다리는 중이다. */
  ask?: string | null;
  now?: Date;
}): Mover | null {
  const now = p.now ?? new Date();
  const label = (a: AgentRow) => a.name || a.agent;
  const doCmd = `/do ${p.key}`;
  const by = (st: string) => p.agents.find((a) => a.state === st);
  const blocked = by("막힘");
  if (blocked) return { tone: "blocked", text: `${label(blocked)} 막힘 — ${blocked.desc ?? ""}`, cmd: blocked.todo };
  // 답 없는 질문이 있으면 자동 실행이 살아 있어도 "곧 ○○ 차례"가 아니다. 답이 와야 움직인다.
  if (p.ask) return { tone: "human", text: `답을 기다리는 중 — ${p.ask}` };
  const human = by("사람 차례");
  if (human) return { tone: "human", text: `${label(human)} — ${human.desc ?? ""}`, cmd: human.todo };
  if (p.qa === "lost") return { tone: "human", text: "QA 감시 끊김 — 다시 시작하거나 멈추기", cmd: `/dobby-qa ${p.key}` };
  const working = p.agents.filter((a) => a.state === "작업중");
  if (p.qa === "active")
    return { tone: "working", text: working.length ? `QA 진행 중 — ${working.map((a) => `${label(a)} ${a.desc ?? ""}`.trim()).join(" · ")}` : "QA 감시 중 — 다음 감시를 기다립니다" };
  const live = working.find((a) => p.sessions[a.agent]);
  if (live) return { tone: "working", text: `${label(live)} 작업 중 — ${live.desc ?? ""}` };
  if (working[0] && !p.autoRunning)
    return { tone: "human", text: `${label(working[0])} 세션 끊김 — 이어서 진행하기`, cmd: doCmd, slug: working[0].agent };
  if (working[0]) return { tone: "auto", text: `자동 실행 — ${label(working[0])} 세션 시작 중` };
  const waiting = by("기다림");
  if (waiting) {
    const t = new Date((waiting.updatedAt || "").replace(" ", "T")).getTime();
    const fresh = !isNaN(t) && now.getTime() - t < HEARTBEAT_MIN * 60000;
    return fresh || p.autoRunning
      ? { tone: "auto", text: `자동 진행 — ${waiting.desc ?? "기다림"}` }
      : { tone: "human", text: `${label(waiting)} 기다림 — 자동 실행이 지켜보지 않음`, cmd: doCmd, slug: waiting.agent };
  }
  const owner = phaseOwner(p.phase);
  const next = owner ? p.agents.find((a) => (owner === "개발자" ? isDevRole(a.name) : a.name === owner)) : undefined;
  if (next?.state === "대기")
    return p.autoRunning
      ? { tone: "auto", text: `자동 진행 — 곧 ${owner} 차례` }
      : { tone: "human", text: `${owner} 차례 — 자동 실행이 꺼져 있습니다`, cmd: doCmd, slug: next.agent };
  const tester = p.agents.find((a) => a.name === "테스터");
  if (/^(해결|종료)$/.test(p.phase) || (p.phase === "검증" && tester?.state === "완료")) {
    if (p.releaseDates.length === 0) return { tone: "after", text: "릴리즈 노트 등록", cmd: `/dobby-release ${p.key}` };
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const ahead = p.releaseDates.filter((d) => d >= today).sort()[0];
    return { tone: "after", text: ahead ? `라이브 배포 대기 — ${ahead} 정기 배포` : "라이브 반영됨" };
  }
  return null;
}

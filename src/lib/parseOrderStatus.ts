/**
 * go-dobby status.md(단일 진행 인덱스) 파서. (순수 함수, node 의존 없음)
 * 규격: redesign-spec §6 / dobby-start SKILL.md "status.md 스키마".
 * 스킬 간 리터럴 드리프트가 있어 방어적으로 파싱한다(단계 superset·상태 어휘 정규화).
 */
import { field, fieldLine, findTable, columnIndex, type TableData } from "@/lib/md";
import { normAgentState, type AgentRow } from "@/lib/parseOrchestration";

const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : "");

/** 정규화된 현재 단계 버킷. */
export type PhaseKey =
  | "착수"
  | "분석"
  | "구현"
  | "리뷰"
  | "통합"
  | "검증"
  | "해결"
  | "종료"
  | "unknown";

/** 표준 단계 순서(타임라인 표시용). */
export const PHASE_ORDER: PhaseKey[] = [
  "착수",
  "분석",
  "구현",
  "리뷰",
  "통합",
  "검증",
  "해결",
  "종료",
];

/**
 * 실제 기록 리터럴을 표준 버킷으로 접는다.
 * 착수 / 분석·분석완료 / 구현중·산출중 / 리뷰중·수정중 / 통합·통합완료 / 검증·검증완료 / 해결 / 종료
 */
export function phaseKey(raw: string | null): PhaseKey {
  const s = (raw ?? "").replace(/\*/g, "").trim();
  if (!s) return "unknown";
  if (/종료/.test(s)) return "종료";
  if (/해결/.test(s)) return "해결";
  if (/검증/.test(s)) return "검증";
  if (/통합/.test(s)) return "통합";
  if (/리뷰|수정/.test(s)) return "리뷰";
  if (/구현|산출/.test(s)) return "구현";
  if (/분석/.test(s)) return "분석";
  if (/착수/.test(s)) return "착수";
  return "unknown";
}

export type BadgeStatus = "success" | "processing" | "warning" | "error" | "default";

/** 현재 단계 → antd Badge status. */
export function phaseBadge(key: PhaseKey): BadgeStatus {
  switch (key) {
    case "종료":
    case "해결":
      return "success";
    case "검증":
    case "통합":
      return "processing";
    case "리뷰":
      return "warning";
    case "구현":
    case "분석":
    case "착수":
      return "processing";
    default:
      return "default";
  }
}

export type OrderMeta = {
  key: string;
  type: string | null;
  title: string | null;
  /** Jira URL (이슈 키) */
  jira: string | null;
  /** 문서 경로 (문서 전용 TASK 키) */
  docPath: string | null;
};

export type PhaseProgressRow = {
  phase: string;
  skill: string;
  state: string;
  artifact: string;
  updatedAt: string;
};

export type TestHistoryRow = {
  round: string;
  startedAt: string;
  state: string;
  /** 원문 "성공/실패/skip" 셀 */
  countsRaw: string;
  pass: number | null;
  fail: number | null;
  skip: number | null;
  folder: string;
};

export type WorktreeRow = { repo: string; branch: string; path: string };

export type ResolutionInfo = {
  at: string | null;
  evidence: string | null;
  note: string | null;
};

export type OrderStatus = {
  meta: OrderMeta;
  /** 현재 단계 원문 */
  phaseRaw: string | null;
  /** 정규화 버킷 */
  phase: PhaseKey;
  skill: string | null;
  updatedAt: string | null;
  /** 팬아웃 K */
  k: number | null;
  agents: AgentRow[];
  progress: PhaseProgressRow[];
  testHistory: TestHistoryRow[];
  worktrees: WorktreeRow[];
  resolution: ResolutionInfo | null;
  raw: string;
};

/** "## 이슈/작업" 섹션 본문(다음 ## 전까지)을 뽑는다. */
function sectionBody(md: string, heading: RegExp): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inSec = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inSec) break;
      inSec = heading.test(line.replace(/^##\s+/, "").replace(/\*/g, "").trim());
      continue;
    }
    if (inSec) out.push(line);
  }
  return out.join("\n").trim();
}

const KNOWN_TYPES = /^(버그|기능|작업|개선|태스크|스토리|에픽|하위작업|bug|feature|task|story|epic|subtask)$/i;

/**
 * "## 이슈/작업"에서 키·타입·제목·링크를 뽑는다.
 * 스펙 형태 "- 키 · 타입 · 제목 · URL"(라벨 유무 모두)과 볼드 라벨 형태 둘 다 대응.
 */
function parseIssueMeta(md: string, fallbackKey: string): OrderMeta {
  const section = sectionBody(md, /^이슈|작업/);
  const src = section || md;

  // Jira URL / 문서 경로
  const urlMatch = src.match(/https?:\/\/\S*\/browse\/[A-Za-z0-9-]+/);
  const jira = urlMatch ? urlMatch[0] : null;
  const isTask = /^TASK-/.test(fallbackKey);

  // 1) 볼드 라벨 우선
  let title = field(src, "제목") ?? fieldLine(src, "제목") ?? null;
  let type = field(src, "타입") ?? null;

  // 2) 라벨 없는 "·" 구분 불릿 처리
  if (!title || !type) {
    const bullet = section
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .find((l) => l.includes("·") || l.includes("|") === false);
    if (bullet) {
      const parts = bullet
        .split("·")
        .map((p) => p.replace(/^\s*(키|타입|제목|이슈|작업|type|title)\s*[:：]\s*/i, "").trim())
        .map((p) => p.replace(/^`|`$/g, "").trim())
        .filter(Boolean)
        .filter((p) => !/^https?:\/\//.test(p) && p !== fallbackKey);
      if (!type) type = parts.find((p) => KNOWN_TYPES.test(p)) ?? null;
      if (!title) {
        const rest = parts.filter((p) => p !== type);
        title = rest.sort((a, b) => b.length - a.length)[0] ?? null;
      }
    }
  }

  // 3) H1 폴백("# {키} 상태")은 제목이 아님 → 무시
  const docPath = isTask
    ? field(src, "문서") ??
      fieldLine(src, "문서") ??
      (section.match(/(?:^|·)\s*([~./][^\s·|]+)/)?.[1] ?? null)
    : null;

  return { key: fallbackKey, type, title, jira, docPath };
}

function rowsOf(t: TableData | null): string[][] {
  return t ? t.rows : [];
}

function parseAgents(md: string): AgentRow[] {
  const t = findTable(md, "슬러그");
  if (!t) return [];
  const ci = {
    slug: columnIndex(t.headers, "슬러그"),
    issue: columnIndex(t.headers, "이슈", "작업"),
    branch: columnIndex(t.headers, "브랜치"),
    state: columnIndex(t.headers, "상태"),
    round: columnIndex(t.headers, "라운드"),
    upd: columnIndex(t.headers, "갱신"),
  };
  return rowsOf(t).map((r) => ({
    agent: at(r, ci.slug),
    issue: at(r, ci.issue),
    branch: at(r, ci.branch),
    state: normAgentState(at(r, ci.state)),
    round: at(r, ci.round),
    updatedAt: at(r, ci.upd),
  }));
}

function parseProgress(md: string): PhaseProgressRow[] {
  const t = findTable(md, "단계");
  // "단계별 진행" 표는 헤더에 단계·스킬·산출물 포함. 에이전트 표(슬러그)와 구분.
  if (!t || columnIndex(t.headers, "슬러그") >= 0) return [];
  const ci = {
    phase: columnIndex(t.headers, "단계"),
    skill: columnIndex(t.headers, "스킬"),
    state: columnIndex(t.headers, "상태"),
    art: columnIndex(t.headers, "산출물"),
    upd: columnIndex(t.headers, "갱신"),
  };
  if (ci.skill < 0 && ci.art < 0) return [];
  return rowsOf(t).map((r) => ({
    phase: at(r, ci.phase),
    skill: at(r, ci.skill),
    state: at(r, ci.state),
    artifact: at(r, ci.art),
    updatedAt: at(r, ci.upd),
  }));
}

function parseTestHistory(md: string): TestHistoryRow[] {
  const t = findTable(md, "회차");
  if (!t) return [];
  const ci = {
    round: columnIndex(t.headers, "회차"),
    start: columnIndex(t.headers, "시작"),
    state: columnIndex(t.headers, "상태"),
    counts: columnIndex(t.headers, "성공", "실패", "skip", "집계"),
    folder: columnIndex(t.headers, "폴더", "경로"),
  };
  return rowsOf(t).map((r) => {
    const countsRaw = at(r, ci.counts);
    const nums = countsRaw.match(/\d+/g)?.map(Number) ?? [];
    return {
      round: at(r, ci.round),
      startedAt: at(r, ci.start),
      state: at(r, ci.state),
      countsRaw,
      pass: nums[0] ?? null,
      fail: nums[1] ?? null,
      skip: nums[2] ?? null,
      folder: at(r, ci.folder).replace(/^`|`$/g, ""),
    };
  });
}

function parseWorktrees(md: string): WorktreeRow[] {
  const t = findTable(md, "repo", "경로");
  if (!t) return [];
  const ci = {
    repo: columnIndex(t.headers, "repo"),
    branch: columnIndex(t.headers, "브랜치"),
    path: columnIndex(t.headers, "경로"),
  };
  if (ci.path < 0) return [];
  return rowsOf(t)
    .map((r) => ({
      repo: at(r, ci.repo).replace(/^`|`$/g, ""),
      branch: at(r, ci.branch).replace(/^`|`$/g, ""),
      path: at(r, ci.path).replace(/^`|`$/g, ""),
    }))
    .filter((w) => w.repo || w.branch || w.path);
}

/** "## 해결" 섹션(dobby-resolve가 추가)을 뽑는다. 없으면 null. */
function parseResolution(md: string): ResolutionInfo | null {
  const idx = md.search(/^##\s*해결\s*$/m);
  if (idx < 0) return null;
  const section = md.slice(idx);
  return {
    at: field(section, "처리 일시") ?? null,
    evidence: fieldLine(section, "근거") ?? null,
    note: fieldLine(section, "비고") ?? null,
  };
}

export function parseOrderStatus(md: string, key: string): OrderStatus {
  const phaseRaw = field(md, "단계") ?? null;
  return {
    meta: parseIssueMeta(md, key),
    phaseRaw,
    phase: phaseKey(phaseRaw),
    skill: field(md, "담당 스킬") ?? null,
    updatedAt:
      field(md, "갱신") ??
      (md.match(/\*\*갱신\*\*\s*[:：]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9:]+)/)?.[1] ?? null),
    k: (() => {
      const m = md.match(/에이전트 수\(K\)\*\*\s*[:：]?\s*(\d+)/);
      return m ? Number(m[1]) : null;
    })(),
    agents: parseAgents(md),
    progress: parseProgress(md),
    testHistory: parseTestHistory(md),
    worktrees: parseWorktrees(md),
    resolution: parseResolution(md),
    raw: md,
  };
}

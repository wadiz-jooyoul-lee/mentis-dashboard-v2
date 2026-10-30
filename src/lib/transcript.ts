/**
 * 클로드 코드 기록(transcript) 리더. (서버 전용, node I/O)
 * - 세션 .jsonl(~/.claude/projects/{인코딩}/{세션ID}.jsonl): 사용자가 직접 실행한 작업
 * - 서브에이전트 .output(agent-logs.json이 가리키는 경로): 하위 에이전트
 * 둘 다 rich JSONL(`message.content` 블록) 포맷 → 콘솔 피드(FeedItem)로 변환한다.
 * stream-json(run.log)과 스키마가 달라 jobs.ts의 parseFeed와 별개다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getMetaDir } from "@/lib/issues";
import { getJobStatus, isRunning, type FeedItem, type JobState } from "@/lib/jobs";

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

/** 도구 입력 요약(jobs.ts briefInput과 동일 취지). */
function briefInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (typeof o.command === "string") return o.command;
  if (typeof o.file_path === "string") return o.file_path;
  if (typeof o.pattern === "string") return String(o.pattern);
  if (typeof o.query === "string") return o.query;
  if (typeof o.prompt === "string") return o.prompt;
  try {
    return JSON.stringify(o);
  } catch {
    return "";
  }
}

/** rich transcript(.jsonl/.output)를 콘솔 피드로 변환. 최근 limit개만. */
export function parseTranscriptFeed(p: string, limit = 150): FeedItem[] {
  let content: string;
  try {
    content = fs.readFileSync(p, "utf8");
  } catch {
    return [];
  }
  const items: FeedItem[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = d.message as { role?: string; content?: unknown } | undefined;
    if (!msg || typeof msg !== "object") continue; // ai-title·attachment·snapshot 등 메타 스킵
    const role = msg.role;
    const c = msg.content;
    if (typeof c === "string") {
      if (c.trim()) items.push({ kind: role === "user" ? "system" : "text", text: c.trim() });
      continue;
    }
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (!b || typeof b !== "object") continue;
      const t = (b as { type?: string }).type;
      if (t === "text") {
        const text = (b as { text?: string }).text;
        if (typeof text === "string" && text.trim()) items.push({ kind: "text", text: text.trim() });
      } else if (t === "tool_use") {
        const name = (b as { name?: string }).name ?? "tool";
        const input = (b as { input?: unknown }).input;
        items.push({ kind: "tool", text: `${name} ${briefInput(input)}`.trim() });
      }
      // tool_result·thinking·image 등은 콘솔 노이즈라 생략
    }
  }
  return items.slice(-limit);
}

function mtimeMs(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** 파일이 최근(windowMs 이내)에 커졌으면 "추적 중"으로 본다. */
export function isFresh(p: string, windowMs = 15000): boolean {
  const t = mtimeMs(p);
  return t > 0 && Date.now() - t < windowMs;
}

/** cwd → ~/.claude/projects 하위 폴더명(비영숫자 → '-'). */
function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

function readFirstRecord(p: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      return JSON.parse(line);
    }
  } catch {
    /* noop */
  }
  return null;
}

export type ConsoleAgent = { id: string; slug: string; phase: string | null; path: string };

type Discovered = { sessionPath: string; agents: ConsoleAgent[] } | null;
const discCache = new Map<string, { at: number; val: Discovered }>();

/**
 * agent-logs.json이 없는 레거시 오더용 폴백: `~/.claude/projects`를 스캔해
 * `{세션}/subagents/*.meta.json` 설명(description)에 키가 든 세션을 찾아
 * 부모 세션 .jsonl + 서브 목록을 복원한다.
 * (클로드가 서브 전사를 `{proj}/{세션}/subagents/agent-*.jsonl`로 영구 저장하는 점 이용)
 * 폴링마다 전체 스캔하지 않도록 5초 메모이즈.
 */
function discoverFromProjects(key: string): Discovered {
  const cached = discCache.get(key);
  if (cached && Date.now() - cached.at < 5000) return cached.val;

  const root = path.join(os.homedir(), ".claude", "projects");
  let best: { sessionPath: string; agents: ConsoleAgent[]; mtime: number } | null = null;
  let projs: string[] = [];
  try {
    projs = fs.readdirSync(root);
  } catch {
    /* noop */
  }
  for (const proj of projs) {
    let sessDirs: fs.Dirent[];
    try {
      sessDirs = fs.readdirSync(path.join(root, proj), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sd of sessDirs) {
      if (!sd.isDirectory()) continue;
      const subDir = path.join(root, proj, sd.name, "subagents");
      let metas: string[];
      try {
        metas = fs.readdirSync(subDir).filter((f) => f.endsWith(".meta.json"));
      } catch {
        continue;
      }
      const agents: ConsoleAgent[] = [];
      let match = false;
      for (const mf of metas) {
        let desc = "";
        try {
          desc = String(JSON.parse(fs.readFileSync(path.join(subDir, mf), "utf8")).description ?? "");
        } catch {
          /* skip */
        }
        if (desc.includes(key)) match = true;
        const agentId = mf.replace(/\.meta\.json$/, "");
        const jsonl = path.join(subDir, `${agentId}.jsonl`);
        if (fs.existsSync(jsonl)) agents.push({ id: agentId, slug: desc || agentId, phase: null, path: jsonl });
      }
      if (!match || agents.length === 0) continue;
      const sessionPath = path.join(root, proj, `${sd.name}.jsonl`);
      if (!fs.existsSync(sessionPath)) continue;
      let mtime = 0;
      try {
        mtime = fs.statSync(sessionPath).mtimeMs;
      } catch {
        /* noop */
      }
      if (!best || mtime > best.mtime) best = { sessionPath, agents, mtime };
    }
  }
  const val: Discovered = best ? { sessionPath: best.sessionPath, agents: best.agents } : null;
  discCache.set(key, { at: Date.now(), val });
  return val;
}

/** 오더의 콘솔 대상 목록. agent-logs.json 우선, 없으면 projects 스캔으로 복원. */
export function listConsoleAgents(key: string): ConsoleAgent[] {
  const p = path.join(getMetaDir(), key, "agent-logs.json");
  let map: Record<string, unknown>;
  try {
    map = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return discoverFromProjects(key)?.agents ?? [];
  }
  const out: ConsoleAgent[] = [];
  for (const [slug, val] of Object.entries(map)) {
    if (typeof val === "string") {
      out.push({ id: slug, slug, phase: null, path: expandHome(val) });
    } else if (val && typeof val === "object") {
      for (const [phase, pv] of Object.entries(val as Record<string, unknown>)) {
        if (typeof pv === "string") out.push({ id: `${slug}::${phase}`, slug, phase, path: expandHome(pv) });
      }
    }
  }
  return out;
}

/** agent-logs.json 하위 키 → 한국어 단계 이름(/do 스킬의 세션 표와 같은 이름). 모르는 키는 null. */
const STEP_NAMES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^design$/, () => "설계"],
  [/^takeover$/, () => "이어받기 설계"],
  [/^analysis$/, () => "분석"],
  [/^impl$/, () => "구현"],
  [/^impl-change-(\d+)$/, (m) => `변경 ${m[1]} 구현`],
  [/^round-(\d+)$/, (m) => `${m[1]}차 리뷰`],
  [/^fix-(\d+)$/, (m) => `${m[1]}차 수정`],
  [/^fix-test-/, () => "검증 실패 수정"],
  [/^integrate$/, () => "통합"],
  [/^verify$/, () => "검증"],
];

/** status.md '## 지난 세션' 표의 세션 아이디 → 단계 이름(플러그인이 적은 한국어). */
function pastSessionSteps(key: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const md = fs.readFileSync(path.join(getMetaDir(), key, "status.md"), "utf8");
    for (const m of md.matchAll(/^\|[^|]*\|\s*([^|]+?)\s*\|\s*`([0-9a-fA-F-]{36})`\s*\|/gm)) out.set(m[2], m[1]);
  } catch {
    /* noop */
  }
  return out;
}

/**
 * 콘솔 드롭다운에 보일 사람용 이름. 키(id)는 그대로 두고 표시만 바꾼다.
 * - 단계: 하위 키 규칙(STEP_NAMES) → 지난 세션 표의 단계 이름(세션 아이디로 찾음) → 하위 키 그대로
 * - 에이전트: 보드 상태표의 이름 → 슬러그
 * - 시각: 기록 파일이 마지막으로 바뀐 때(MM-DD HH:mm)
 */
export function consoleAgentLabels(
  key: string,
  nameBySlug: Map<string, string>,
): { id: string; label: string; time: string | null }[] {
  const steps = pastSessionSteps(key);
  return listConsoleAgents(key).map((a) => {
    const name = nameBySlug.get(a.slug) || a.slug;
    let step: string | null = null;
    if (a.phase) {
      for (const [re, fn] of STEP_NAMES) {
        const m = a.phase.match(re);
        if (m) {
          step = fn(m);
          break;
        }
      }
      step ??= steps.get(path.basename(a.path, ".jsonl")) ?? a.phase;
    }
    const t = mtimeMs(a.path);
    const d = new Date(t);
    const p2 = (n: number) => String(n).padStart(2, "0");
    const time = t > 0 ? `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}` : null;
    return { id: a.id, label: step ? `${step} — ${name}` : name, time };
  });
}

/** 서브에이전트 로그 경로 해석(id 우선 → slug+phase → slug의 impl/produce/첫번째). */
function resolveAgent(key: string, agent: string, phase?: string): ConsoleAgent | null {
  const list = listConsoleAgents(key);
  let e = list.find((x) => x.id === agent);
  if (!e && phase) e = list.find((x) => x.slug === agent && x.phase === phase);
  if (!e) {
    const bySlug = list.filter((x) => x.slug === agent);
    e = bySlug.find((x) => x.phase === "impl") ?? bySlug.find((x) => x.phase === "produce") ?? bySlug[0];
  }
  return e ?? null;
}

/** 사용자가 직접 실행한 오더의 부모 세션 .jsonl 경로. status.md 기록 → agent .output 메타 순. */
export function resolveParentSession(key: string): string | null {
  // 1) status.md의 세션 기록(dobby-order가 남김)
  try {
    const md = fs.readFileSync(path.join(getMetaDir(), key, "status.md"), "utf8");
    const sid = md.match(/세션\s*ID[*`\s]*[:：]\s*`?([0-9a-fA-F-]{36})`?/)?.[1];
    const cwd = md.match(/작업\s*경로[*`\s]*[:：]\s*`?([^\s`|]+)`?/)?.[1];
    if (sid && cwd) {
      const p = path.join(os.homedir(), ".claude", "projects", encodeProjectDir(expandHome(cwd)), `${sid}.jsonl`);
      if (fs.existsSync(p)) return p;
    }
  } catch {
    /* noop */
  }
  // 2) 서브 .output의 sessionId+cwd로 부모 세션 도출
  const first = listConsoleAgents(key)[0];
  if (first) {
    const rec = readFirstRecord(first.path);
    const sid = rec?.sessionId as string | undefined;
    const cwd = rec?.cwd as string | undefined;
    if (sid && cwd) {
      const p = path.join(os.homedir(), ".claude", "projects", encodeProjectDir(cwd), `${sid}.jsonl`);
      if (fs.existsSync(p)) return p;
    }
  }
  // 3) projects 스캔(레거시: agent-logs.json·세션기록 모두 없을 때)
  const disc = discoverFromProjects(key);
  if (disc && fs.existsSync(disc.sessionPath)) return disc.sessionPath;
  return null;
}

/** 콘솔 상태(잡 실시간 / 기록 재생·추적 통합). */
export type ConsoleStatus =
  | { state: "none" }
  | {
      state: Exclude<JobState, "none">;
      feed: FeedItem[];
      sessionId: string | null;
      pending: string | null;
      startedAt?: number;
      /** 소스 종류. 없으면 잡(job)으로 간주. */
      mode?: "job" | "transcript";
      /** 정지·이어서 등 제어 가능 여부. 없으면 잡이므로 제어 가능. */
      controllable?: boolean;
      /** 기록 추적 중(파일이 최근 커짐) 또는 잡 실행 중. */
      live?: boolean;
      /** 소스 설명 라벨. */
      label?: string;
    };

function transcriptView(p: string, label: string): ConsoleStatus {
  if (!fs.existsSync(p)) {
    return { state: "none" };
  }
  const feed = parseTranscriptFeed(p);
  const live = isFresh(p);
  return {
    state: live ? "running" : "done",
    feed,
    sessionId: null,
    pending: null,
    mode: "transcript",
    controllable: false,
    live,
    label,
  };
}

export type ConsoleOpts = {
  /** "live"(기본): 대시보드가 띄운 run.log 실시간. "session": 부모 세션 기록. */
  source?: "live" | "session";
  /** 지정 시 서브에이전트 기록(.output). source보다 우선. */
  agent?: string;
  phase?: string;
};

/**
 * 콘솔 소스별 해석 (실시간과 지난 기록을 각각 별도로 제공).
 * - agent 지정 → 서브에이전트 .output (기록, 읽기전용)
 * - source="session" → 부모 세션 .jsonl (클로드 히스토리 기록, 읽기전용)
 * - 그 외(기본 live) → run.log 실시간(대시보드 실행 잡. 제어 가능). 없으면 none.
 */
export function getConsole(key: string, opts: ConsoleOpts = {}): ConsoleStatus {
  const { source, agent, phase } = opts;
  if (agent) {
    const e = resolveAgent(key, agent, phase);
    if (e) return transcriptView(e.path, `서브 기록: ${e.slug}${e.phase ? " · " + e.phase : ""}`);
    // 보드 에이전트 슬러그가 콘솔 로그 id와 안 맞을 때(레거시 자동탐색 등)
    // → 오케스트레이터 세션 기록으로 폴백해 빈 화면 대신 전체 기록을 보여준다.
    const sess = resolveParentSession(key);
    if (sess) return transcriptView(sess, "오케스트레이터 기록(세션)");
    return { state: "none" };
  }
  if (source === "session") {
    const sess = resolveParentSession(key);
    if (!sess) return { state: "none" };
    return transcriptView(sess, "오케스트레이터 기록(세션)");
  }
  // 기본: 실시간(run.log). 기록으로 폴백하지 않는다(기록은 별도 소스로 제공).
  const job = getJobStatus(key);
  if (job.state !== "none") {
    return { ...job, mode: "job", controllable: true, live: job.state === "running", label: "대시보드 실행 로그(run.log)" };
  }
  return { state: "none" };
}

/**
 * 콘솔 목록·보드 카드의 "진행 중" 표시용. 콘솔마다 지금 작업 중인지만 가볍게 판정한다.
 * - live.__live__: 대시보드가 띄운 잡 프로세스가 살아 있는지
 * - live.__session__ · 서브: 기록 파일이 최근(isFresh) 커졌는지 — 콘솔 화면의 "추적 중"과 같은 기준
 * - latest: 슬러그별로 가장 최근에 바뀐 콘솔 id (보드 카드 → 그 에이전트의 콘솔로 이동)
 * agentsOnly(보드용): __live__·__session__ 판정을 건너뛴다. ps 실행과 부모 세션 탐색
 * (큰 기록 파일 읽기·projects 전체 스캔)이 5초마다 돌며 화면 이동 요청을 붙잡지 않게 한다.
 */
export function consoleLiveness(
  key: string,
  agentsOnly = false,
): {
  live: Record<string, boolean>;
  latest: Record<string, string>;
} {
  const live: Record<string, boolean> = {};
  if (!agentsOnly) {
    live.__live__ = isRunning(key);
    const sess = resolveParentSession(key);
    live.__session__ = !!sess && isFresh(sess);
  }
  const latest: Record<string, string> = {};
  const latestAt: Record<string, number> = {};
  for (const a of listConsoleAgents(key)) {
    live[a.id] = isFresh(a.path);
    const t = mtimeMs(a.path);
    if (!(a.slug in latestAt) || t > latestAt[a.slug]) {
      latestAt[a.slug] = t;
      latest[a.slug] = a.id;
    }
  }
  return { live, latest };
}

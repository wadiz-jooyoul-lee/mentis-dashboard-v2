/**
 * go-dobby 오케스트레이션 리더. (서버 전용, node I/O)
 * go-dobby는 이슈당 폴더 1개(`$ORCHESTRATION_META/{키}/`)를 쓴다. 각 키를 하나의 "에픽"으로 본다.
 * K≥2면 orchestration.md·agents/·reviews/·agent-logs.json이 있고, K=1이면 status.md의
 * 에이전트 표로 오케스트레이션을 합성한다. 컴포넌트(OrchestrationList/Board/Changes)가
 * 쓰는 EpicSummary/EpicDetail shape은 유지하고 workType만 추가한다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getMetaDir } from "@/lib/issues";
import { ORDER_KEY_RE } from "@/lib/keys";
import { parseOrchestration, type Orchestration } from "@/lib/parseOrchestration";
import { parseOrderStatus, phaseText, type PhaseKey } from "@/lib/parseOrderStatus";
import { listConsoleAgents } from "@/lib/transcript";
import type { Metric, CardStats } from "@/lib/lifecycle";
import type { ReportRun } from "@/lib/issues";

/** 이슈 키(FE1-1187) 또는 문서 전용 작업 키(TASK-slug). */
const KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+|TASK-[A-Za-z0-9-]+)$/;

export type WorkType = "code" | "nonsource" | null;

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** 오더 폴더 경로. */
function orderDir(key: string): string {
  return path.join(getMetaDir(), key);
}

/** `$ORCHESTRATION_META` 아래 오더(이슈/작업) 키들. status.md 또는 orchestration.md가 있는 폴더. */
function epicKeys(): string[] {
  const root = getMetaDir();
  if (!fs.existsSync(root)) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && KEY_RE.test(d.name))
    .filter(
      (d) =>
        fs.existsSync(path.join(root, d.name, "status.md")) ||
        fs.existsSync(path.join(root, d.name, "orchestration.md"))
    )
    .map((d) => d.name);
}

/** work-type: produce.md/deliverables → 비소스, implementation.md → code, status 힌트, 그 외 기본 개발(code). */
function workTypeOf(key: string, statusMd: string | null): WorkType {
  const dir = orderDir(key);
  if (fs.existsSync(path.join(dir, "produce.md"))) return "nonsource";
  // 코드 구현 증거(implementation.md)를 deliverables보다 먼저 본다.
  // 개발 오더도 감사·분석 에이전트가 deliverables/에 보고서를 남기므로,
  // deliverables를 먼저 보면 코드 오더가 비개발로 오분류된다(FE-10884 사례).
  if (fs.existsSync(path.join(dir, "implementation.md"))) return "code";
  if (fs.existsSync(path.join(dir, "deliverables"))) return "nonsource";
  if (statusMd) {
    const wt = parseOrderStatus(statusMd, key).workTypeHint;
    if (wt) return wt;
  }
  // 명시적으로 비소스(produce.md·deliverables·힌트)라는 근거가 없으면 개발(code)로 본다.
  // → 분석 초기라 산출물이 아직 없는 오더도 개발 카드/필터에 잡힌다(미분류로 사라지지 않음).
  return "code";
}

/**
 * 이 슬러그의 산출물(deliverables/{슬러그}.md 또는 폴더)이 있으면 완료로 본다.
 * 오케스트레이터가 상태표 갱신을 미뤄도(감사·산출 에이전트가 결과물만 남긴 경우)
 * 대시보드가 결과물을 근거로 완료를 즉시 반영하기 위함. 코드 에이전트는 deliverables를
 * 만들지 않으므로 이 보정에 걸리지 않는다(잘못된 완료 표시 방지).
 */
function completedByDeliverable(key: string, slug: string): boolean {
  if (!slug || slug === "-") return false;
  const base = path.join(orderDir(key), "deliverables");
  try {
    return fs.existsSync(path.join(base, `${slug}.md`)) || fs.existsSync(path.join(base, slug));
  } catch {
    return false;
  }
}

/** agent-logs.json의 슬러그 목록(스폰된 에이전트). 문자열·객체 값 모두 키만 취한다. */
function agentLogSlugs(key: string): string[] {
  const raw = readFileSafe(path.join(orderDir(key), "agent-logs.json"));
  if (!raw) return [];
  try {
    return Object.keys(JSON.parse(raw) as Record<string, unknown>).filter((k) => k && k !== "-");
  } catch {
    return [];
  }
}

/** 상태표가 진행 상태여도, 산출물이 있으면 완료로 보정한다. */
function applyDeliverableCompletion(key: string, o: Orchestration): Orchestration {
  o.agents = o.agents.map((a) =>
    a.state !== "완료" && completedByDeliverable(key, a.agent) ? { ...a, state: "완료" } : a
  );
  return o;
}

/**
 * 스폰됐지만(agent-logs.json에 있음) 상태표에는 없는 에이전트를 보드에 병합한다.
 * 오케스트레이터가 새 에이전트 행 추가를 누락해도 대시보드에 보이게 한다.
 * 상태: 산출물이 있으면 완료, 없으면 진행중으로 추정.
 */
function mergeSpawnedAgents(key: string, o: Orchestration): Orchestration {
  const have = new Set(o.agents.map((a) => a.agent));
  for (const slug of agentLogSlugs(key)) {
    if (have.has(slug)) continue;
    o.agents.push({
      agent: slug,
      issue: "",
      branch: "",
      state: completedByDeliverable(key, slug) ? "완료" : "진행중",
      round: "",
      updatedAt: "",
      startedAt: "",
    });
  }
  return o;
}

/** orchestration.md가 있으면 파싱, 없으면 status.md 에이전트 표로 합성. 이후 산출물·스폰로그로 보정. */
function orchestrationOf(key: string, statusMd: string | null): Orchestration | null {
  const omd = readFileSafe(path.join(orderDir(key), "orchestration.md"));
  let o: Orchestration | null = null;
  if (omd) {
    o = parseOrchestration(omd);
    if (!o.epicKey) o.epicKey = key;
  } else if (statusMd) {
    const st = parseOrderStatus(statusMd, key);
    if (st.agents.length > 0) {
      o = { epicKey: key, mode: null, agents: st.agents, scope: [], conflicts: "", events: [], restMarkdown: "" };
    }
  }
  // 상태표가 없어도 스폰된 에이전트가 있으면 보드를 만든다.
  if (!o) {
    if (agentLogSlugs(key).length === 0) return null;
    o = { epicKey: key, mode: null, agents: [], scope: [], conflicts: "", events: [], restMarkdown: "" };
  }
  return mergeSpawnedAgents(key, applyDeliverableCompletion(key, o));
}

export type Counts = { total: number } & Record<string, number>;

function countAgents(o: Orchestration): Counts {
  const c: Counts = { total: 0 };
  for (const a of o.agents) {
    c.total++;
    c[a.state] = (c[a.state] ?? 0) + 1;
  }
  return c;
}

/** 기록된 워크트리 경로가 있고 모두 디스크에서 사라졌으면 true(dobby-end 정리 등). 기록 없으면 false(알 수 없음). */
function worktreesGone(worktrees: { path: string }[]): boolean {
  const withPath = worktrees.filter((w) => w.path);
  if (withPath.length === 0) return false;
  return withPath.every((w) => {
    const p = w.path.startsWith("~") ? path.join(os.homedir(), w.path.slice(1)) : w.path;
    return !fs.existsSync(p);
  });
}

export type EpicSummary = {
  epicKey: string;
  mode: string | null;
  counts: Counts;
  agentCount: number;
  latestEventTime: string | null;
  latestEventText: string | null;
  lastActivity: string | null;
  /** 최초 활동 시각(가장 이른 이벤트/갱신) — "오늘 시작" 판정용. */
  firstActivity: string | null;
  /** 활성 에이전트 중 착수 후 오래 멈춘(정체) 것이 하나라도 있으면 true — "주의" 판정용. */
  stalled: boolean;
  /** go-dobby 확장: 개발/비개발 구분 + 제목 */
  workType: WorkType;
  title: string | null;
  /** 기록된 워크트리가 모두 삭제됨(dobby-end 정리). status.md 워크트리 표 경로 존재로 판단. */
  worktreeRemoved: boolean;
  /** status.md 현재 단계(정규화 버킷) + 짧은 라벨 — 에이전트 표가 아직 없는 착수 직후 표시용 */
  phase: PhaseKey;
  phaseLabel: string;
};

// "일하는 중"인 상태 + 착수 후 STALE_MIN분 이상 경과면 정체(대시보드 보드와 동일 기준).
const CARD_ACTIVE_STATES = ["분석", "구현", "리뷰"];
const CARD_STALE_MIN = 15;
function agentStalled(startedAt: string): boolean {
  if (!/\d{1,2}:\d{2}/.test(startedAt)) return false; // 시:분 없으면 경과 못 잼 → 판정 안 함
  const d = new Date(startedAt.replace(" ", "T"));
  if (isNaN(d.getTime())) return false;
  return Math.floor((Date.now() - d.getTime()) / 60000) >= CARD_STALE_MIN;
}

function summarize(key: string, o: Orchestration | null, statusMd: string | null): EpicSummary {
  const counts = o ? countAgents(o) : { total: 0 };
  const times = o
    ? [...o.events.map((e) => e.time), ...o.agents.map((a) => a.updatedAt).filter(Boolean)].sort()
    : [];
  const st = statusMd ? parseOrderStatus(statusMd, key) : null;
  const stalled = !!o?.agents.some(
    (a) => CARD_ACTIVE_STATES.includes(a.state) && agentStalled(a.startedAt)
  );
  return {
    epicKey: key,
    mode: o?.mode ?? null,
    counts,
    agentCount: o?.agents.length ?? 0,
    latestEventTime: o?.events[0]?.time ?? null,
    latestEventText: o?.events[0]?.text ?? null,
    lastActivity: (times.length ? times[times.length - 1] : null) ?? st?.updatedAt ?? null,
    firstActivity: (times.length ? times[0] : null) ?? null,
    stalled,
    workType: workTypeOf(key, statusMd),
    title: st?.meta.title ?? null,
    worktreeRemoved: st ? worktreesGone(st.worktrees) : false,
    phase: st?.phase ?? "unknown",
    phaseLabel: st ? phaseText(st.phaseRaw, st.phase) : "-",
  };
}

export function listEpics(): EpicSummary[] {
  const epics: EpicSummary[] = [];
  for (const key of epicKeys()) {
    const statusMd = readFileSafe(path.join(orderDir(key), "status.md"));
    epics.push(summarize(key, orchestrationOf(key, statusMd), statusMd));
  }
  epics.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  return epics;
}

/**
 * 각 에이전트의 현재 "작업 지문" = `상태#라운드`(결과물 완료 보정 반영). 슬러그→지문.
 * 아바타 소감(재미기능)이 "소감 만든 뒤 추가 작업했는지"를 판단하는 근거로 쓴다.
 */
export function agentSigs(key: string): Record<string, string> {
  const statusMd = readFileSafe(path.join(orderDir(key), "status.md"));
  const o = orchestrationOf(key, statusMd);
  const out: Record<string, string> = {};
  if (o) for (const a of o.agents) out[a.agent] = `${a.state}#${a.round}`;
  return out;
}

export type Contract = { slug: string; role: string; raw: string };
export type ReviewFile = { round: number; slug: string; content: string };
export type EditHunk = { old: string; new: string };
export type FileDiff = { file: string; hunks: EditHunk[] };
export type AgentWork = {
  slug: string;
  logPath: string;
  found: boolean;
  baseDir: string;
  files: string[];
  diffs: FileDiff[];
  commits: string[];
  summary: string;
};

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}
function commonDir(paths: string[]): string {
  if (paths.length === 0) return "";
  const split = paths.map((p) => p.split("/"));
  const first = split[0];
  let i = 0;
  for (; i < first.length; i++) if (!split.every((s) => s[i] === first[i])) break;
  return first.slice(0, i).join("/");
}

function parseAgentLog(rawPath: string): Omit<AgentWork, "slug"> {
  const logPath = expandHome(rawPath);
  const empty = { logPath, found: false, baseDir: "", files: [] as string[], diffs: [] as FileDiff[], commits: [] as string[], summary: "" };
  let content: string;
  try {
    content = fs.readFileSync(logPath, "utf8");
  } catch {
    return empty;
  }
  const metaRoot = getMetaDir();
  // 메타(진행 기록) 경로는 코드 변경이 아니므로 제외한다.
  // 현재 v2 메타 루트뿐 아니라, 알려진 메타 루트 이름(orchestration-meta·dobby-meta)과
  // v1 work-dobby 분리 트리(.issue-start/.issue-test/.issue-end/.agent-start)까지 잡는다.
  const isMeta = (p: string) =>
    p.startsWith(metaRoot) ||
    /\/(orchestration-meta|dobby-meta)\//.test(p) ||
    /\/\.(issue-start|issue-test|issue-end|agent-start)\//.test(p);
  const fileSet = new Set<string>();
  const diffMap = new Map<string, EditHunk[]>();
  const commits: string[] = [];
  let summary = "";
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let d: unknown;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = (d as { message?: unknown }).message;
    if (!msg || typeof msg !== "object") continue;
    const blocks = (msg as { content?: unknown }).content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const type = (b as { type?: string }).type;
      if (type === "tool_use") {
        const name = (b as { name?: string }).name;
        const input = (b as { input?: Record<string, unknown> }).input ?? {};
        if (name === "Edit" || name === "Write" || name === "NotebookEdit") {
          const fp = input.file_path;
          // 메타 파일($ORCHESTRATION_META 하위: status.md·implementation.md 등)은
          // 코드 구현이 아니라 진행 기록이므로 파일 목록·diff 모두에서 제외한다.
          if (typeof fp === "string" && !isMeta(fp)) {
            fileSet.add(fp);
            const hunk: EditHunk =
              name === "Write"
                ? { old: "", new: String(input.content ?? "") }
                : { old: String(input.old_string ?? ""), new: String(input.new_string ?? "") };
            const arr = diffMap.get(fp) ?? [];
            arr.push(hunk);
            diffMap.set(fp, arr);
          }
        } else if (name === "Bash") {
          const cmd = input.command;
          if (typeof cmd === "string" && /git (commit|push)/.test(cmd)) {
            commits.push(cmd.replace(/\s+/g, " ").trim().slice(0, 200));
          }
        }
      } else if (type === "text") {
        const t = (b as { text?: string }).text;
        if (typeof t === "string" && t.trim()) summary = t;
      }
    }
  }
  const files = Array.from(fileSet);
  const base = commonDir(files);
  const rel = (f: string) => (base && f.startsWith(base) ? f.slice(base.length + 1) : f);
  const diffs: FileDiff[] = Array.from(diffMap.entries()).map(([f, hunks]) => ({ file: rel(f), hunks }));
  return { logPath, found: true, baseDir: base, files: files.map(rel), diffs, commits, summary };
}

export type Deliverable = { name: string; content: string; kind: "md" | "html" | "other" };

export type EpicDetail = {
  epicKey: string;
  orchestration: Orchestration | null;
  contracts: Contract[];
  reviews: ReviewFile[];
  agentWorks: AgentWork[];
  /** go-dobby 오더 산출물(v1처럼 상세에 함께 표시) */
  workType: WorkType;
  title: string | null;
  /** 기록된 워크트리가 모두 삭제됨(dobby-end 정리). */
  worktreeRemoved: boolean;
  /** status.md 현재 단계 라벨(에이전트 상태표가 아직 없을 때 표시용). */
  phaseLabel: string | null;
  analysisMd: string | null;
  implementationMd: string | null;
  produceMd: string | null;
  summaryMd: string | null;
  /** 자율 판단 기록(decisions.md). 대시보드가 카드로 렌더. 없으면 null. */
  decisionsMd: string | null;
  /** 사이드 이펙트 분석(side-effects.md). 대시보드가 카드로 렌더. 없으면 null. */
  sideEffectsMd: string | null;
  /** 사용자 수동 확인 가이드(test-guide.md). 대시보드가 카드로 렌더. 없으면 null. */
  testGuideMd: string | null;
  deliverables: Deliverable[];
  runs: ReportRun[];
  /** 대시보드가 띄운 잡(run.log)이 있는지 — 실시간 콘솔 가용 여부. */
  hasJob: boolean;
  /** 비전공자용 쉬운 설명(explainer.md). 없으면 null. */
  explainerMd: string | null;
  /** Jira 탭 — dobby-order가 저장한 이슈 원문(jira-issue.md). 있으면 Jira 탭 표시. */
  jiraIssueMd: string | null;
  /** Jira 탭 — 읽기 쉽게 정리한 이슈(jira-issue-clean.md). 버튼 생성. */
  jiraIssueCleanMd: string | null;
  /** Jira 탭 — 코멘트 핵심 정리(jira-comments.md). 버튼 생성. */
  jiraCommentsMd: string | null;
  /** Jira 탭 — 업데이트 내용 정리(jira-enrich.md). 버튼 생성·편집 가능. */
  jiraEnrichMd: string | null;
  /** Jira 탭 — 게시 여부 플래그(jira-enrich.json). desc/comment별 반영 시각. */
  jiraPosted: { desc?: string; comment?: string };
};

/** test-runs/{시각}/result.md 회차들(최신순). */
function readRuns(key: string): ReportRun[] {
  const runsDir = path.join(orderDir(key), "test-runs");
  if (!fs.existsSync(runsDir)) return [];
  const runs: ReportRun[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const runDir = path.join(runsDir, e.name);
    let mds: string[] = [];
    try {
      mds = fs.readdirSync(runDir).filter((f) => f.toLowerCase().endsWith(".md"));
    } catch {
      continue;
    }
    const file = mds.find((f) => /result/i.test(f)) ?? mds[0];
    if (!file) continue;
    const content = readFileSafe(path.join(runDir, file)) ?? "";
    const m = e.name.match(/(\d{4})-?(\d{2})-?(\d{2})[-_ ]?(\d{2}):?(\d{2}):?(\d{2})/);
    const label = m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : e.name;
    const sortKey = m
      ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
      : 0;
    runs.push({ id: e.name, label, file: path.join("test-runs", e.name, file), content, sortKey });
  }
  runs.sort((a, b) => b.sortKey - a.sortKey);
  return runs;
}

/** deliverables/ 산출물(produce.md 제외). md/html/기타 구분. */
function readDeliverables(key: string): Deliverable[] {
  const dir = path.join(orderDir(key), "deliverables");
  if (!fs.existsSync(dir)) return [];
  const out: Deliverable[] = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f === "produce.md") continue;
      const lower = f.toLowerCase();
      const kind = lower.endsWith(".md") ? "md" : lower.endsWith(".html") || lower.endsWith(".htm") ? "html" : "other";
      const content = kind === "other" ? "" : readFileSafe(path.join(dir, f)) ?? "";
      out.push({ name: f, content, kind });
    }
  } catch {
    /* skip */
  }
  return out;
}

export function getEpic(epicKey: string): EpicDetail | null {
  const dir = orderDir(epicKey);
  if (!fs.existsSync(dir)) return null;
  const statusMd = readFileSafe(path.join(dir, "status.md"));
  const orchestration = orchestrationOf(epicKey, statusMd);
  if (!orchestration) return null;

  const contracts: Contract[] = [];
  const agentsDir = path.join(dir, "agents");
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir)) {
      if (!f.toLowerCase().endsWith(".md")) continue;
      const raw = readFileSafe(path.join(agentsDir, f)) ?? "";
      const role = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f.replace(/\.md$/, "");
      contracts.push({ slug: f.replace(/\.md$/, ""), role, raw });
    }
  }

  const reviews: ReviewFile[] = [];
  const reviewsDir = path.join(dir, "reviews");
  if (fs.existsSync(reviewsDir)) {
    for (const rd of fs.readdirSync(reviewsDir, { withFileTypes: true })) {
      if (!rd.isDirectory()) continue;
      const round = Number(rd.name.match(/round-(\d+)/)?.[1] ?? 0);
      const roundDir = path.join(reviewsDir, rd.name);
      for (const f of fs.readdirSync(roundDir)) {
        if (!f.toLowerCase().endsWith(".md")) continue;
        reviews.push({ round, slug: f.replace(/\.md$/, ""), content: readFileSafe(path.join(roundDir, f)) ?? "" });
      }
    }
  }
  reviews.sort((a, b) => b.round - a.round || a.slug.localeCompare(b.slug));

  // 코드 변경(로그 기반): agent-logs.json(문자열/단계별 객체) 우선, 없으면 projects 자동탐색.
  // listConsoleAgents가 두 경우를 모두 평탄화(id=슬러그[::단계])해 주므로, 같은 슬러그의
  // 여러 단계(analysis/impl 등)를 하나로 합쳐 구현 diff·커밋이 드러나게 한다.
  const agentWorks: AgentWork[] = [];
  {
    const bySlug = new Map<string, AgentWork>();
    for (const ca of listConsoleAgents(epicKey)) {
      const parsed = parseAgentLog(ca.path);
      const cur = bySlug.get(ca.slug);
      if (cur) {
        cur.files = Array.from(new Set([...cur.files, ...parsed.files]));
        cur.diffs.push(...parsed.diffs);
        cur.commits.push(...parsed.commits);
        cur.found = cur.found || parsed.found;
        if (parsed.diffs.length && parsed.summary) cur.summary = parsed.summary;
      } else {
        bySlug.set(ca.slug, { slug: ca.slug, ...parsed });
      }
    }
    agentWorks.push(...bySlug.values());
  }
  agentWorks.sort((a, b) => a.slug.localeCompare(b.slug));

  const st = statusMd ? parseOrderStatus(statusMd, epicKey) : null;
  return {
    epicKey,
    orchestration,
    contracts,
    reviews,
    agentWorks,
    workType: workTypeOf(epicKey, statusMd),
    title: st?.meta.title ?? null,
    worktreeRemoved: st ? worktreesGone(st.worktrees) : false,
    phaseLabel: st ? phaseText(st.phaseRaw, st.phase) : null,
    analysisMd: readFileSafe(path.join(dir, "analysis.md")),
    implementationMd: readFileSafe(path.join(dir, "implementation.md")),
    produceMd:
      readFileSafe(path.join(dir, "produce.md")) ??
      readFileSafe(path.join(dir, "deliverables", "produce.md")),
    summaryMd: readFileSafe(path.join(dir, "summary.md")),
    decisionsMd: readFileSafe(path.join(dir, "decisions.md")),
    sideEffectsMd: readFileSafe(path.join(dir, "side-effects.md")),
    testGuideMd: readFileSafe(path.join(dir, "test-guide.md")),
    deliverables: readDeliverables(epicKey),
    runs: readRuns(epicKey),
    hasJob: fs.existsSync(path.join(getMetaDir(), ".mentis-jobs", epicKey, "run.json")),
    explainerMd: readFileSafe(path.join(dir, "explainer.md")),
    jiraIssueMd: readFileSafe(path.join(dir, "jira-issue.md")),
    jiraIssueCleanMd: readFileSafe(path.join(dir, "jira-issue-clean.md")),
    jiraCommentsMd: readFileSafe(path.join(dir, "jira-comments.md")),
    jiraEnrichMd: readFileSafe(path.join(dir, "jira-enrich.md")),
    jiraPosted: readJiraPosted(dir),
  };
}

/** jira-enrich.json에서 게시 여부 플래그를 읽는다(없으면 빈 객체). */
function readJiraPosted(dir: string): { desc?: string; comment?: string } {
  const raw = readFileSafe(path.join(dir, "jira-enrich.json"));
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as { desc?: unknown; comment?: unknown };
    const r: { desc?: string; comment?: string } = {};
    if (typeof o.desc === "string") r.desc = o.desc;
    if (typeof o.comment === "string") r.comment = o.comment;
    return r;
  } catch {
    return {};
  }
}

/**
 * 사용자가 편집한 업데이트 초안을 jira-enrich.md에 저장한다(게시 전 수정용).
 * 잡이 아니라 직접 파일 쓰기.
 */
export function saveJiraEnrichDraft(key: string, text: string): { ok: boolean; reason?: string } {
  if (!ORDER_KEY_RE.test(key)) return { ok: false, reason: "invalid_key" };
  const dir = orderDir(key);
  if (!fs.existsSync(dir)) return { ok: false, reason: "no_order" };
  try {
    fs.writeFileSync(path.join(dir, "jira-enrich.md"), text, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, reason: "write_failed" };
  }
}

/** 오더가 끝난 상태인가(목록 "작업 상태"와 동일 기준): dobby-end 종료 또는 dobby-resolve 해결. */
function orderFinished(e: EpicSummary): boolean {
  return e.worktreeRemoved || e.phase === "종료" || e.phase === "해결";
}
/** 시각 문자열의 날짜(YYYY-MM-DD) 부분. 없으면 null. */
function dateOf(v: string | null): string | null {
  const m = v?.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
/** 로컬 기준 YYYY-MM-DD. */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 허브 카드용 work-type별 지표(개발/비개발). 전부 **오더 개수** 기준.
 * - 위(overall): 전체 · 진행 중 · 완료(+ 정체 있으면 주의).
 * - 아래(today): 오늘 시작 · 오늘 완료 · 오늘 활동.
 */
export function orchestrationCardStats(workType: WorkType): CardStats {
  const epics = listEpics().filter((e) => e.workType === workType);
  const total = epics.length;
  if (total === 0) return { overall: [{ label: "오더", value: 0 }], today: [] };

  const done = epics.filter(orderFinished).length;
  const inProgress = total - done;
  const attention = epics.filter((e) => !orderFinished(e) && e.stalled).length;

  const today = ymd(new Date());
  const startedToday = epics.filter((e) => dateOf(e.firstActivity) === today).length;
  const doneToday = epics.filter((e) => orderFinished(e) && dateOf(e.lastActivity) === today).length;
  const activeToday = epics.filter((e) => dateOf(e.lastActivity) === today).length;

  return {
    overall: [
      { label: "전체", value: total },
      { label: "진행 중", value: inProgress, color: "blue" },
      { label: "완료", value: done, color: "green" },
      ...(attention > 0 ? [{ label: "주의", value: attention, color: "red" }] : []),
    ],
    today: [
      { label: "오늘 시작", value: startedToday },
      { label: "오늘 완료", value: doneToday, color: "green" },
      { label: "오늘 활동", value: activeToday, color: "blue" },
    ],
  };
}

/** 허브 오케스트레이션 지표. */
export function orchestrationMetrics(): Metric[] {
  const epics = listEpics();
  if (epics.length === 0) return [];
  const sum = (k: string) => epics.reduce((n, e) => n + (e.counts[k] ?? 0), 0);
  const impl = sum("구현");
  const review = sum("리뷰");
  const done = sum("완료");
  return [
    { label: "오더", value: epics.length },
    ...(impl > 0 ? [{ label: "구현", value: impl, color: "blue" }] : []),
    ...(review > 0 ? [{ label: "리뷰", value: review, color: "orange" }] : []),
    ...(done > 0 ? [{ label: "완료", value: done, color: "green" }] : []),
  ];
}

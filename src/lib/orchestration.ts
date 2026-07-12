import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getMetaDir, type IssueSummary, listIssues } from "@/lib/issues";
import { getStart } from "@/lib/lifecycle";
import type { IssueStart } from "@/lib/parseStart";
import {
  parseOrchestration,
  type Orchestration,
} from "@/lib/parseOrchestration";
import { isToday, type Metric } from "@/lib/lifecycle";

export function getAgentStartDir(): string {
  return process.env.AGENT_START_DIR || path.join(getMetaDir(), ".agent-start");
}

function epicDirs(): string[] {
  const root = getAgentStartDir();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
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

export type EpicSummary = {
  epicKey: string;
  mode: string | null;
  counts: Counts;
  agentCount: number;
  latestEventTime: string | null;
  latestEventText: string | null;
  /** 정체 판단용: 가장 최근 활동 시각(이벤트/에이전트 갱신 중 최신, 원문) */
  lastActivity: string | null;
};

function orchestrationOf(epicKey: string): Orchestration | null {
  const md = readFileSafe(
    path.join(getAgentStartDir(), epicKey, "orchestration.md")
  );
  if (!md) return null;
  const o = parseOrchestration(md);
  if (!o.epicKey) o.epicKey = epicKey;
  return o;
}

function summarize(epicKey: string, o: Orchestration): EpicSummary {
  const counts = countAgents(o);
  const times = [
    ...o.events.map((e) => e.time),
    ...o.agents.map((a) => a.updatedAt).filter(Boolean),
  ].sort();
  return {
    epicKey: o.epicKey,
    mode: o.mode,
    counts,
    agentCount: o.agents.length,
    latestEventTime: o.events[0]?.time ?? null,
    latestEventText: o.events[0]?.text ?? null,
    lastActivity: times.length ? times[times.length - 1] : null,
  };
}

export function listEpics(): EpicSummary[] {
  const epics: EpicSummary[] = [];
  for (const key of epicDirs()) {
    const o = orchestrationOf(key);
    if (o) epics.push(summarize(key, o));
    else
      epics.push({
        epicKey: key,
        mode: null,
        counts: { total: 0 },
        agentCount: 0,
        latestEventTime: null,
        latestEventText: null,
        lastActivity: null,
      });
  }
  epics.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
  return epics;
}

export type Contract = { slug: string; role: string; raw: string };
export type ReviewFile = { round: number; slug: string; content: string };

/** Edit/Write 한 번의 before→after. Write는 old="". */
export type EditHunk = { old: string; new: string };
/** 코드 파일 하나에 대한 변경 묶음(시간순). */
export type FileDiff = { file: string; hunks: EditHunk[] };

/** 에이전트 대화 로그(jsonl)에서 뽑아낸 실제 작업 내역. */
export type AgentWork = {
  slug: string;
  logPath: string;
  found: boolean;
  /** 수정/생성 파일의 공통 상위 경로(표시용) */
  baseDir: string;
  /** baseDir 기준 상대 경로 목록(수정·생성) */
  files: string[];
  /** 코드 파일별 실제 변경(diff). 메타 파일(.issue-start/.agent-start)은 제외 */
  diffs: FileDiff[];
  /** git commit/push 명령 발췌 */
  commits: string[];
  /** 에이전트의 마지막 응답(요약) */
  summary: string;
};

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

/** 여러 경로의 공통 디렉터리 접두. */
function commonDir(paths: string[]): string {
  if (paths.length === 0) return "";
  const split = paths.map((p) => p.split("/"));
  const first = split[0];
  let i = 0;
  for (; i < first.length; i++) {
    if (!split.every((s) => s[i] === first[i])) break;
  }
  return first.slice(0, i).join("/");
}

/** 에이전트 대화 로그(jsonl)를 파싱해 수정 파일·커밋·요약을 추출. */
function parseAgentLog(rawPath: string): Omit<AgentWork, "slug"> {
  const logPath = expandHome(rawPath);
  const empty = {
    logPath,
    found: false,
    baseDir: "",
    files: [] as string[],
    diffs: [] as FileDiff[],
    commits: [] as string[],
    summary: "",
  };
  let content: string;
  try {
    content = fs.readFileSync(logPath, "utf8");
  } catch {
    return empty;
  }
  const fileSet = new Set<string>();
  const diffMap = new Map<string, EditHunk[]>(); // 코드 파일 → hunks(시간순)
  const isMeta = (p: string) =>
    p.includes("/.issue-start/") || p.includes("/.agent-start/");
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
          if (typeof fp === "string") {
            fileSet.add(fp);
            if (!isMeta(fp)) {
              const hunk: EditHunk =
                name === "Write"
                  ? { old: "", new: String(input.content ?? "") }
                  : {
                      old: String(input.old_string ?? ""),
                      new: String(input.new_string ?? ""),
                    };
              const arr = diffMap.get(fp) ?? [];
              arr.push(hunk);
              diffMap.set(fp, arr);
            }
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
  const rel = (f: string) =>
    base && f.startsWith(base) ? f.slice(base.length + 1) : f;
  const diffs: FileDiff[] = Array.from(diffMap.entries()).map(([f, hunks]) => ({
    file: rel(f),
    hunks,
  }));
  return {
    logPath,
    found: true,
    baseDir: base,
    files: files.map(rel),
    diffs,
    commits,
    summary,
  };
}

export type EpicDetail = {
  epicKey: string;
  orchestration: Orchestration | null;
  contracts: Contract[];
  reviews: ReviewFile[];
  /** 에이전트별 실제 작업 내역(agent-logs.json → 대화 로그 파싱) */
  agentWorks: AgentWork[];
  /** 하위이슈 키 → 착수 메타(구현 섹션 등). 없으면 생략 */
  subStatuses: Record<string, IssueStart>;
  /** 하위이슈 키 → 테스트 요약(있으면) */
  subTests: Record<string, IssueSummary>;
};

export function getEpic(epicKey: string): EpicDetail | null {
  const dir = path.join(getAgentStartDir(), epicKey);
  if (!fs.existsSync(dir)) return null;

  const orchestration = orchestrationOf(epicKey);

  // 계약
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

  // 리뷰 (round-{n}/{slug}.md)
  const reviews: ReviewFile[] = [];
  const reviewsDir = path.join(dir, "reviews");
  if (fs.existsSync(reviewsDir)) {
    for (const rd of fs.readdirSync(reviewsDir, { withFileTypes: true })) {
      if (!rd.isDirectory()) continue;
      const round = Number(rd.name.match(/round-(\d+)/)?.[1] ?? 0);
      const roundDir = path.join(reviewsDir, rd.name);
      for (const f of fs.readdirSync(roundDir)) {
        if (!f.toLowerCase().endsWith(".md")) continue;
        reviews.push({
          round,
          slug: f.replace(/\.md$/, ""),
          content: readFileSafe(path.join(roundDir, f)) ?? "",
        });
      }
    }
  }
  reviews.sort((a, b) => b.round - a.round || a.slug.localeCompare(b.slug));

  // 에이전트별 실제 작업 내역 (agent-logs.json → 대화 로그 파싱)
  const agentWorks: AgentWork[] = [];
  const logsJson = readFileSafe(path.join(dir, "agent-logs.json"));
  if (logsJson) {
    let map: Record<string, string> = {};
    try {
      map = JSON.parse(logsJson);
    } catch {
      map = {};
    }
    for (const [slug, logPath] of Object.entries(map)) {
      if (typeof logPath !== "string") continue;
      agentWorks.push({ slug, ...parseAgentLog(logPath) });
    }
  }
  agentWorks.sort((a, b) => a.slug.localeCompare(b.slug));

  // 하위이슈 착수·테스트 메타
  const subStatuses: Record<string, IssueStart> = {};
  const subTests: Record<string, IssueSummary> = {};
  const testMap = new Map(listIssues().map((t) => [t.key, t]));
  const issueKeys = new Set(
    (orchestration?.agents ?? []).map((a) => a.issue).filter(Boolean)
  );
  for (const k of Array.from(issueKeys)) {
    const s = getStart(k);
    if (s) subStatuses[k] = s;
    const t = testMap.get(k);
    if (t) subTests[k] = t;
  }

  return {
    epicKey,
    orchestration,
    contracts,
    reviews,
    agentWorks,
    subStatuses,
    subTests,
  };
}

/** 허브 오케스트레이션 카드용 지표 */
export function orchestrationMetrics(): Metric[] {
  const epics = listEpics();
  if (epics.length === 0) return [];
  const sum = (k: string) => epics.reduce((n, e) => n + (e.counts[k] ?? 0), 0);
  const impl = sum("구현중");
  const fix = sum("수정중");
  const review = sum("리뷰중");
  const done = sum("완료");
  const epicsToday = epics.filter((e) => isToday(e.lastActivity)).length;
  return [
    { label: "에픽", value: epics.length, today: epicsToday },
    ...(impl > 0 ? [{ label: "구현중", value: impl, color: "blue" }] : []),
    ...(review > 0 ? [{ label: "리뷰중", value: review, color: "orange" }] : []),
    ...(fix > 0 ? [{ label: "수정중", value: fix, color: "orange" }] : []),
    ...(done > 0 ? [{ label: "완료", value: done, color: "green" }] : []),
  ];
}

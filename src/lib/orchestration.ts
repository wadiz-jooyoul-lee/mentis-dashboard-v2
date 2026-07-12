/**
 * go-dobby 오케스트레이션 리더. (서버 전용, node I/O)
 * go-dobby는 이슈당 폴더 1개(`$DOBBY_META/{키}/`)를 쓴다. 각 키를 하나의 "에픽"으로 본다.
 * K≥2면 orchestration.md·agents/·reviews/·agent-logs.json이 있고, K=1이면 status.md의
 * 에이전트 표로 오케스트레이션을 합성한다. 컴포넌트(OrchestrationList/Board/Changes)가
 * 쓰는 EpicSummary/EpicDetail shape은 유지하고 workType만 추가한다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getMetaDir } from "@/lib/issues";
import { parseOrchestration, type Orchestration } from "@/lib/parseOrchestration";
import { parseOrderStatus } from "@/lib/parseOrderStatus";
import type { Metric } from "@/lib/lifecycle";

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

/** `$DOBBY_META` 아래 오더(이슈/작업) 키들. status.md 또는 orchestration.md가 있는 폴더. */
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

/** work-type: produce.md/deliverables → 비소스, implementation.md → code, 아니면 status 힌트. */
function workTypeOf(key: string, statusMd: string | null): WorkType {
  const dir = orderDir(key);
  if (fs.existsSync(path.join(dir, "produce.md"))) return "nonsource";
  if (fs.existsSync(path.join(dir, "deliverables"))) return "nonsource";
  if (fs.existsSync(path.join(dir, "implementation.md"))) return "code";
  if (statusMd) {
    const wt = parseOrderStatus(statusMd, key).workTypeHint;
    if (wt) return wt;
  }
  return null;
}

/** orchestration.md가 있으면 파싱, 없으면 status.md 에이전트 표로 합성. */
function orchestrationOf(key: string, statusMd: string | null): Orchestration | null {
  const omd = readFileSafe(path.join(orderDir(key), "orchestration.md"));
  if (omd) {
    const o = parseOrchestration(omd);
    if (!o.epicKey) o.epicKey = key;
    return o;
  }
  if (statusMd) {
    const st = parseOrderStatus(statusMd, key);
    if (st.agents.length > 0) {
      return {
        epicKey: key,
        mode: null,
        agents: st.agents,
        scope: [],
        conflicts: "",
        events: [],
        restMarkdown: "",
      };
    }
  }
  return null;
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
  lastActivity: string | null;
  /** go-dobby 확장: 개발/비개발 구분 + 제목 */
  workType: WorkType;
  title: string | null;
};

function summarize(key: string, o: Orchestration | null, statusMd: string | null): EpicSummary {
  const counts = o ? countAgents(o) : { total: 0 };
  const times = o
    ? [...o.events.map((e) => e.time), ...o.agents.map((a) => a.updatedAt).filter(Boolean)].sort()
    : [];
  const st = statusMd ? parseOrderStatus(statusMd, key) : null;
  return {
    epicKey: key,
    mode: o?.mode ?? null,
    counts,
    agentCount: o?.agents.length ?? 0,
    latestEventTime: o?.events[0]?.time ?? null,
    latestEventText: o?.events[0]?.text ?? null,
    lastActivity: (times.length ? times[times.length - 1] : null) ?? st?.updatedAt ?? null,
    workType: workTypeOf(key, statusMd),
    title: st?.meta.title ?? null,
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
  const isMeta = (p: string) => p.startsWith(metaRoot);
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
          if (typeof fp === "string") {
            fileSet.add(fp);
            if (!isMeta(fp)) {
              const hunk: EditHunk =
                name === "Write"
                  ? { old: "", new: String(input.content ?? "") }
                  : { old: String(input.old_string ?? ""), new: String(input.new_string ?? "") };
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
  const rel = (f: string) => (base && f.startsWith(base) ? f.slice(base.length + 1) : f);
  const diffs: FileDiff[] = Array.from(diffMap.entries()).map(([f, hunks]) => ({ file: rel(f), hunks }));
  return { logPath, found: true, baseDir: base, files: files.map(rel), diffs, commits, summary };
}

export type EpicDetail = {
  epicKey: string;
  orchestration: Orchestration | null;
  contracts: Contract[];
  reviews: ReviewFile[];
  agentWorks: AgentWork[];
};

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

  return { epicKey, orchestration, contracts, reviews, agentWorks };
}

/** 허브 카드용 work-type별 지표(개발/비개발). */
export function orchestrationMetricsFor(workType: WorkType): Metric[] {
  const epics = listEpics().filter((e) => e.workType === workType);
  if (epics.length === 0) return [{ label: "오더", value: 0 }];
  const sum = (k: string) => epics.reduce((n, e) => n + (e.counts[k] ?? 0), 0);
  const impl = sum("구현중") + sum("산출중");
  const review = sum("리뷰중");
  const done = sum("완료");
  return [
    { label: "오더", value: epics.length },
    ...(impl > 0 ? [{ label: "진행중", value: impl, color: "blue" }] : []),
    ...(review > 0 ? [{ label: "리뷰중", value: review, color: "orange" }] : []),
    ...(done > 0 ? [{ label: "완료", value: done, color: "green" }] : []),
  ];
}

/** 허브 오케스트레이션 지표. */
export function orchestrationMetrics(): Metric[] {
  const epics = listEpics();
  if (epics.length === 0) return [];
  const sum = (k: string) => epics.reduce((n, e) => n + (e.counts[k] ?? 0), 0);
  const impl = sum("구현중");
  const review = sum("리뷰중");
  const done = sum("완료");
  return [
    { label: "오더", value: epics.length },
    ...(impl > 0 ? [{ label: "구현중", value: impl, color: "blue" }] : []),
    ...(review > 0 ? [{ label: "리뷰중", value: review, color: "orange" }] : []),
    ...(done > 0 ? [{ label: "완료", value: done, color: "green" }] : []),
  ];
}

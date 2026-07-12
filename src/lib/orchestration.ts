/**
 * go-dobby 오케스트레이션(K≥2) 리더. (서버 전용, node I/O)
 * K≥2일 때 루트 키 폴더 `$DOBBY_META/{키}/`에 orchestration.md·agents/·reviews/·agent-logs.json이 있다.
 * 기존 컴포넌트(OrchestrationBoard·OrchestrationChanges)가 쓰는 타입·getEpic 시그니처는 유지한다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getMetaDir, orderDir, readFileSafe } from "@/lib/config";
import {
  parseOrchestration,
  type Orchestration,
} from "@/lib/parseOrchestration";

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
  baseDir: string;
  files: string[];
  diffs: FileDiff[];
  commits: string[];
  summary: string;
};

export type EpicDetail = {
  epicKey: string;
  orchestration: Orchestration | null;
  contracts: Contract[];
  reviews: ReviewFile[];
  /** 에이전트별 실제 작업 내역(agent-logs.json → 대화 로그 파싱) */
  agentWorks: AgentWork[];
};

function orchestrationOf(epicKey: string): Orchestration | null {
  const md = readFileSafe(path.join(orderDir(epicKey), "orchestration.md"));
  if (!md) return null;
  const o = parseOrchestration(md);
  if (!o.epicKey) o.epicKey = epicKey;
  return o;
}

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
  // 메타 파일($DOBBY_META 하위: status.md·analysis.md 등)은 코드 변경에서 제외한다.
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

/** K≥2 오케스트레이션 상세. orchestration.md가 없으면(K=1 등) null. */
export function getEpic(epicKey: string): EpicDetail | null {
  const dir = orderDir(epicKey);
  if (!fs.existsSync(dir)) return null;
  const orchestration = orchestrationOf(epicKey);
  if (!orchestration) return null; // K=1 이면 orchestration.md 없음

  // 계약(agents/{슬러그}.md · review-agent.md)
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

  // 리뷰(reviews/round-{n}/{슬러그}.md)
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

  // 에이전트별 실제 작업 내역(agent-logs.json → 대화 로그 파싱)
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

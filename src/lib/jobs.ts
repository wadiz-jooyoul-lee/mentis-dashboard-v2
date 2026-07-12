import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { getMetaDir, getWorkspaceDir, getReposRoot } from "@/lib/issues";

/** Jira 이슈 키 형식(프로젝트 키는 영문자로 시작). 예: FE-10806, FE1-1234, QA-22370 */
export const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9]*-\d+$/;

function jobDir(key: string): string {
  return path.join(getMetaDir(), ".mentis-jobs", key);
}
const logPath = (key: string) => path.join(jobDir(key), "run.log");
const metaPath = (key: string) => path.join(jobDir(key), "run.json");

function claudeBin(): string {
  const local = path.join(os.homedir(), ".local", "bin", "claude");
  return fs.existsSync(local) ? local : "claude";
}

type Meta = {
  key: string;
  pid: number;
  startedAt: number;
  /** 보관(목록에서 숨김). 데이터는 삭제하지 않고 유지한다. */
  archived?: boolean;
};

function readMeta(key: string): Meta | null {
  try {
    return JSON.parse(fs.readFileSync(metaPath(key), "utf8"));
  } catch {
    return null;
  }
}

function readLog(key: string): string {
  try {
    return fs.readFileSync(logPath(key), "utf8");
  } catch {
    return "";
  }
}

export function isRunning(key: string): boolean {
  const m = readMeta(key);
  if (!m || m.pid <= 0) return false;
  try {
    process.kill(m.pid, 0); // 시그널 0 = 존재 확인만
    return true;
  } catch {
    return false;
  }
}

/** claude 헤드리스 실행 공통(신규 실행/재개 공용). append=true면 로그 이어쓰기. */
function spawnClaude(key: string, promptArgs: string[], append: boolean): void {
  fs.mkdirSync(jobDir(key), { recursive: true });
  const out = fs.openSync(logPath(key), append ? "a" : "w");
  const workspace = getWorkspaceDir();
  const args = [
    ...promptArgs,
    "--permission-mode",
    "bypassPermissions",
    "--output-format",
    "stream-json",
    "--verbose",
    // 워크트리·메타가 놓이는 작업 루트 + 원본 저장소 루트(워크트리 생성용)
    "--add-dir",
    workspace,
    "--add-dir",
    getReposRoot(),
  ];
  const child = spawn(claudeBin(), args, {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, NODE_EXTRA_CA_CERTS: "" },
  });
  fs.writeFileSync(
    metaPath(key),
    JSON.stringify({ key, pid: child.pid ?? -1, startedAt: Date.now() })
  );
  child.unref();
}

export function startIssueStart(key: string): { ok: boolean; reason?: string } {
  if (!ISSUE_KEY_RE.test(key)) return { ok: false, reason: "invalid_key" };
  if (isRunning(key)) return { ok: false, reason: "already_running" };
  spawnClaude(key, ["-p", `/issue-start ${key}`], false);
  return { ok: true };
}

/** 정지: 실행 중인 프로세스(그룹)를 종료한다. */
export function stopIssueStart(key: string): { ok: boolean; reason?: string } {
  const m = readMeta(key);
  if (!m || m.pid <= 0 || !isRunning(key)) {
    return { ok: false, reason: "not_running" };
  }
  try {
    // detached 실행이라 pid는 프로세스 그룹 리더 → 음수로 그룹 전체 종료(MCP 등 하위 포함)
    process.kill(-m.pid, "SIGTERM");
  } catch {
    try {
      process.kill(m.pid, "SIGTERM");
    } catch {
      return { ok: false, reason: "not_running" };
    }
  }
  return { ok: true };
}

function setArchived(key: string, val: boolean): boolean {
  const m = readMeta(key);
  if (!m) return false;
  fs.writeFileSync(metaPath(key), JSON.stringify({ ...m, archived: val }));
  return true;
}

/** 보관: 목록에서 숨긴다(데이터는 유지). 실행 중이면 거부. */
export function archiveJob(key: string): { ok: boolean; reason?: string } {
  if (!ISSUE_KEY_RE.test(key)) return { ok: false, reason: "invalid_key" };
  if (isRunning(key)) return { ok: false, reason: "running" };
  return setArchived(key, true)
    ? { ok: true }
    : { ok: false, reason: "not_found" };
}

/** 복원: 보관 해제. */
export function unarchiveJob(key: string): { ok: boolean; reason?: string } {
  if (!ISSUE_KEY_RE.test(key)) return { ok: false, reason: "invalid_key" };
  return setArchived(key, false)
    ? { ok: true }
    : { ok: false, reason: "not_found" };
}

/** 이어서 진행: 로그의 session_id로 같은 세션을 --resume 한다. */
export function resumeIssueStart(key: string): { ok: boolean; reason?: string } {
  if (!ISSUE_KEY_RE.test(key)) return { ok: false, reason: "invalid_key" };
  if (isRunning(key)) return { ok: false, reason: "already_running" };
  const sid = parseSessionId(readLog(key));
  if (!sid) return { ok: false, reason: "no_session" };
  spawnClaude(key, ["--resume", sid, "-p", "중단된 지점부터 이어서 계속 진행해줘."], true);
  return { ok: true };
}

export type FeedItem = {
  kind: "system" | "text" | "tool" | "result";
  text: string;
};

export type JobStatus =
  | { state: "none" }
  | {
      state: "running" | "done" | "failed";
      startedAt: number;
      feed: FeedItem[];
      /** 재개 가능 여부(세션ID 존재) */
      sessionId: string | null;
    };

function parseSessionId(log: string): string | null {
  for (const line of log.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s);
      if (
        ev.type === "system" &&
        ev.subtype === "init" &&
        typeof ev.session_id === "string"
      ) {
        return ev.session_id;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

function briefInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (typeof o.command === "string") return o.command.slice(0, 100);
  if (typeof o.file_path === "string") return o.file_path;
  if (typeof o.pattern === "string") return String(o.pattern);
  if (typeof o.query === "string") return o.query.slice(0, 80);
  try {
    const s = JSON.stringify(o);
    return s.length > 100 ? s.slice(0, 100) + "…" : s;
  } catch {
    return "";
  }
}

function parseFeed(log: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const line of log.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(s);
    } catch {
      continue;
    }
    if (ev.type === "system") {
      if (ev.subtype === "init") items.push({ kind: "system", text: "세션 시작" });
    } else if (ev.type === "assistant") {
      const content = (ev.message as { content?: unknown[] })?.content ?? [];
      for (const b of content as Array<Record<string, unknown>>) {
        if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
          items.push({ kind: "text", text: b.text.trim() });
        } else if (b.type === "tool_use") {
          items.push({
            kind: "tool",
            text: `${b.name as string} ${briefInput(b.input)}`.trim(),
          });
        }
      }
    } else if (ev.type === "result") {
      items.push({ kind: "result", text: ev.is_error ? "❌ 실패" : "✅ 완료" });
    }
  }
  return items;
}

export type JobWithKey = Exclude<JobStatus, { state: "none" }> & {
  key: string;
};

function allJobKeys(): string[] {
  const dir = path.join(getMetaDir(), ".mentis-jobs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function listJobsBy(archived: boolean): JobWithKey[] {
  const jobs: JobWithKey[] = [];
  for (const key of allJobKeys()) {
    const m = readMeta(key);
    if (!m) continue;
    if ((m.archived === true) !== archived) continue;
    const s = getJobStatus(key);
    if (s.state !== "none") jobs.push({ ...s, key });
  }
  jobs.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  return jobs;
}

/** 활성(보관되지 않은) 잡을 최신순으로 반환. */
export function listJobs(): JobWithKey[] {
  return listJobsBy(false);
}

/** 보관된 잡을 최신순으로 반환. */
export function listArchivedJobs(): JobWithKey[] {
  return listJobsBy(true);
}

export function getJobStatus(key: string): JobStatus {
  const m = readMeta(key);
  if (!m) return { state: "none" };
  const running = isRunning(key);
  const log = readLog(key);
  const feed = parseFeed(log);

  let state: "running" | "done" | "failed";
  if (running) state = "running";
  else if (feed.some((f) => f.kind === "result" && f.text.startsWith("❌")))
    state = "failed";
  else if (feed.some((f) => f.kind === "result")) state = "done";
  else state = "failed"; // result 이벤트 없이 종료(정지/오류) → 실패로 간주

  return {
    state,
    startedAt: m.startedAt,
    feed: feed.slice(-80),
    sessionId: parseSessionId(log),
  };
}

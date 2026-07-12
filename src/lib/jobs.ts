/**
 * go-dobby 잡 실행(헤드리스 claude spawn). (서버 전용, node I/O)
 * 대시보드에서 `/dobby-order {키}`를 백그라운드로 띄우고 진행 로그를 읽는다.
 * 로그·메타: `$DOBBY_META/.mentis-jobs/{키}/`.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { getMetaDir, getWorkspaceDir, getReposRoot } from "@/lib/issues";
import { ORDER_KEY_RE } from "@/lib/keys";

export { ORDER_KEY_RE };

function jobsRoot(): string {
  return path.join(getMetaDir(), ".mentis-jobs");
}
function jobDir(key: string): string {
  return path.join(jobsRoot(), key);
}
const logPath = (key: string) => path.join(jobDir(key), "run.log");
const metaPath = (key: string) => path.join(jobDir(key), "run.json");
const pendingPath = (key: string) => path.join(jobDir(key), "pending.txt");

/** 예약 메시지: 다음 턴(현재 실행 종료 직후)에 자동으로 이어서 넣을 피드백. */
export function setPending(key: string, text: string): boolean {
  if (!JOB_ID_RE.test(key) || !text.trim()) return false;
  try {
    fs.mkdirSync(jobDir(key), { recursive: true });
    fs.writeFileSync(pendingPath(key), text.trim());
    return true;
  } catch {
    return false;
  }
}
export function getPending(key: string): string | null {
  try {
    const t = fs.readFileSync(pendingPath(key), "utf8").trim();
    return t || null;
  } catch {
    return null;
  }
}
export function clearPending(key: string): void {
  try {
    fs.rmSync(pendingPath(key), { force: true });
  } catch {
    /* noop */
  }
}

function claudeBin(): string {
  const local = path.join(os.homedir(), ".local", "bin", "claude");
  return fs.existsSync(local) ? local : "claude";
}

type Meta = {
  key: string;
  pid: number;
  startedAt: number;
  /** 사용자가 정지시킨 시각(있으면 종료를 '정지'로 구분) */
  stoppedAt?: number;
  /** 보관(목록에서 숨김). 데이터는 유지. */
  archived?: boolean;
};

function readMeta(key: string): Meta | null {
  try {
    return JSON.parse(fs.readFileSync(metaPath(key), "utf8"));
  } catch {
    return null;
  }
}

function writeMeta(m: Meta): void {
  fs.writeFileSync(metaPath(m.key), JSON.stringify(m));
}

function readLog(key: string): string {
  try {
    return fs.readFileSync(logPath(key), "utf8");
  } catch {
    return "";
  }
}

/** PID가 실제로 우리가 띄운 claude 프로세스인지 확인(PID 재사용 오인 방지). */
function processIsClaude(pid: number): boolean {
  try {
    const out = execFileSync("ps", ["-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return /claude/i.test(out);
  } catch {
    return false;
  }
}

export function isRunning(key: string): boolean {
  const m = readMeta(key);
  if (!m || m.pid <= 0) return false;
  try {
    process.kill(m.pid, 0); // 존재 확인
  } catch {
    return false;
  }
  // 존재하더라도 재사용된 무관한 PID일 수 있으므로 명령까지 확인
  return processIsClaude(m.pid);
}

/** claude 헤드리스 실행(신규/재개 공용). append=true면 로그 이어쓰기. */
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
  writeMeta({ key, pid: child.pid ?? -1, startedAt: Date.now() });
  child.unref();
}

/** 잡 폴더 id 형식(파일시스템 안전). 이슈 키·TASK 키·task-{slug} 모두 허용. */
export const JOB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

/**
 * 실행 입력(이슈 키·이슈 URL·문서 URL/경로·자유 요구사항)에서 잡 폴더 id를 도출한다.
 * - 이슈 키/URL → 그 키(오더 키와 일치)
 * - 그 외(문서 전용 등) → task-{slug} 임시 id (최종 TASK-{slug} 오더 키와는 별개)
 */
export function deriveJobId(target: string): string {
  const t = target.trim();
  const first = t.split(/\s+/)[0] || t;
  if (ORDER_KEY_RE.test(first)) return first;
  const m = t.match(/\/browse\/([A-Za-z][A-Za-z0-9]*-\d+)/);
  if (m) return m[1];
  // 문서 전용: ascii slug + 대상 해시(한글 등 비-ascii로 slug가 비어도 고유·결정적)
  const slug = t
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return `task-${slug ? slug + "-" : ""}${h.toString(36)}`;
}

/**
 * dobby-order 실행. target은 `/dobby-order` 뒤에 그대로 전달된다
 * (이슈 키·URL·문서·요구사항 + base=/agents=/mode= 인자 포함 가능).
 */
export function startOrder(target: string): { ok: boolean; reason?: string; jobId?: string } {
  const t = target.trim();
  if (!t) return { ok: false, reason: "empty" };
  const jobId = deriveJobId(t);
  if (isRunning(jobId)) return { ok: false, reason: "already_running" };
  spawnClaude(jobId, ["-p", `/dobby-order ${t}`], false);
  return { ok: true, jobId };
}

/** 정지: 실행 중인 프로세스(그룹)를 종료한다. */
export function stopOrder(key: string): { ok: boolean; reason?: string } {
  const m = readMeta(key);
  if (!m || m.pid <= 0 || !isRunning(key)) return { ok: false, reason: "not_running" };
  const mark = () => writeMeta({ ...m, stoppedAt: Date.now() });
  try {
    // detached 실행이라 pid는 프로세스 그룹 리더 → 음수로 그룹 전체 종료.
    process.kill(-m.pid, "SIGTERM");
    mark();
    return { ok: true };
  } catch {
    try {
      process.kill(m.pid, "SIGTERM");
      mark();
      return { ok: true };
    } catch {
      return { ok: false, reason: "not_running" };
    }
  }
}

function setArchived(key: string, val: boolean): boolean {
  const m = readMeta(key);
  if (!m) return false;
  writeMeta({ ...m, archived: val });
  return true;
}

export function archiveJob(key: string): { ok: boolean; reason?: string } {
  if (!JOB_ID_RE.test(key)) return { ok: false, reason: "invalid_key" };
  if (isRunning(key)) return { ok: false, reason: "running" };
  return setArchived(key, true) ? { ok: true } : { ok: false, reason: "not_found" };
}

export function unarchiveJob(key: string): { ok: boolean; reason?: string } {
  if (!JOB_ID_RE.test(key)) return { ok: false, reason: "invalid_key" };
  return setArchived(key, false) ? { ok: true } : { ok: false, reason: "not_found" };
}

/**
 * 이어서 진행: 로그의 session_id로 같은 세션을 --resume 한다.
 * message가 있으면 그 피드백을 다음 턴 지시로 넣고, 없으면 기본 "계속 진행" 문구.
 */
export function resumeOrder(key: string, message?: string): { ok: boolean; reason?: string } {
  if (!JOB_ID_RE.test(key)) return { ok: false, reason: "invalid_key" };
  if (isRunning(key)) return { ok: false, reason: "already_running" };
  const sid = parseSessionId(readLog(key));
  if (!sid) return { ok: false, reason: "no_session" };
  const msg = (message && message.trim()) || "중단된 지점부터 이어서 계속 진행해줘.";
  spawnClaude(key, ["--resume", sid, "-p", msg], true);
  return { ok: true };
}

/** 예약 메시지를 소비해 이어서 진행(턴 종료 직후 자동 주입). 성공 시 예약을 비운다. */
export function applyPending(key: string): { ok: boolean; reason?: string } {
  const msg = getPending(key);
  if (!msg) return { ok: false, reason: "no_pending" };
  const r = resumeOrder(key, msg);
  if (r.ok) clearPending(key);
  return r;
}

export type FeedItem = {
  kind: "system" | "text" | "tool" | "result";
  text: string;
};

export type JobState = "none" | "running" | "done" | "failed" | "stopped";

export type JobStatus =
  | { state: "none" }
  | {
      state: Exclude<JobState, "none">;
      startedAt: number;
      feed: FeedItem[];
      sessionId: string | null;
      /** 예약된 피드백(다음 턴 자동 주입 대기 중). 없으면 null. */
      pending: string | null;
    };

function parseSessionId(log: string): string | null {
  for (const line of log.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s);
      if (ev.type === "system" && ev.subtype === "init" && typeof ev.session_id === "string") {
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
  if (typeof o.prompt === "string") return o.prompt.slice(0, 80);
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

export type JobWithKey = Exclude<JobStatus, { state: "none" }> & { key: string };

function allJobKeys(): string[] {
  const dir = jobsRoot();
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
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

export function listJobs(): JobWithKey[] {
  return listJobsBy(false);
}
export function listArchivedJobs(): JobWithKey[] {
  return listJobsBy(true);
}

export function getJobStatus(key: string): JobStatus {
  const m = readMeta(key);
  if (!m) return { state: "none" };
  const running = isRunning(key);
  const log = readLog(key);
  const feed = parseFeed(log);

  let state: Exclude<JobState, "none">;
  if (running) state = "running";
  else if (feed.some((f) => f.kind === "result" && f.text.startsWith("❌"))) state = "failed";
  else if (feed.some((f) => f.kind === "result")) state = "done";
  else if (m.stoppedAt) state = "stopped"; // result 없이 사용자가 정지
  else state = "failed"; // result 없이 비정상 종료

  return {
    state,
    startedAt: m.startedAt,
    feed: feed.slice(-80),
    sessionId: parseSessionId(log),
    pending: getPending(key),
  };
}

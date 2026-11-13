/**
 * 팀 이슈 조사(go-dobby dobby-jobs) 연결. (서버 전용)
 * 실행 판정·중복 방지는 플러그인의 schedule.py 가 맡고, 여기서는 부르고 결과 파일을 읽기만 한다.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { goDobbyLib } from "@/lib/jobs";
import { getDocsRoot, getMetaDir, getReposRoot } from "@/lib/issues";
import type { CardStats } from "@/lib/lifecycle";

export type JobsStatus = {
  running: { by?: string; startedAt?: string | null } | null;
  lastSuccess: string | null;
  lastMode: "baseline" | "daily" | null;
  lastError: string | null;
  triesToday: number;
  nextAuto: string;
  log: string;
};

export type JobsBranch = {
  repo: string;
  branch: string;
  date: string;
  in: string[];
  live: boolean;
  prs: { n: number; state: string; base: string; url: string; draft: boolean; review: string | null }[];
};
export type JobsIssue = {
  key: string;
  project: string;
  summary: string;
  status: string;
  assignee: string;
  parent: string | null;
  parentSummary: string | null;
  type: string;
  created: string;
  updated: string;
  docs: string[];
  picked?: boolean;
  isNew?: boolean;
  changes?: { at: string; from: string; to: string; by: string }[];
  branches: JobsBranch[];
  stage: string;
  lastCommit: string | null;
};
export type JobsOverlap = { order: string; issue: string; level: "충돌 주의" | "같은 기능"; why: string[]; more?: number };
export type JobsData = {
  mode: "baseline" | "daily";
  since: string;
  until: string;
  generatedAt: string;
  me: string | null;
  teams: Record<string, string>;
  fetchFailed: string[];
  repoCount: number;
  headline?: string[];
  issues: JobsIssue[];
  orders: { key: string; title: string; stage: string; parent: string | null; fileCount: number }[];
  overlaps: JobsOverlap[];
};

/** 설치된 go-dobby 의 schedule.py. 설치 전 시험은 DOBBY_JOBS_SCRIPT 로 가리킨다. */
function scheduleScript(): string | null {
  const dev = process.env.DOBBY_JOBS_SCRIPT;
  if (dev && fs.existsSync(dev)) return dev;
  const lib = goDobbyLib(); // {플러그인}/reference/dobby-lib.sh
  if (!lib) return null;
  const p = path.join(path.dirname(path.dirname(lib)), "skills/dobby-jobs/scripts/schedule.py");
  return fs.existsSync(p) ? p : null;
}

function call(cmd: "status" | "tick" | "run"): Promise<Record<string, unknown> | null> {
  const script = scheduleScript();
  if (!script) return Promise.resolve(null);
  // 오피스도 같은 경로를 쓰므로 대시보드가 보는 경로를 그대로 넘긴다
  const env = { ...process.env, ORCHESTRATION_META_PATH: getMetaDir(), ORCHESTRATION_DOCS_ROOT: getDocsRoot(), ORCHESTRATION_REPOS_ROOT: getReposRoot() };
  return new Promise((resolve) => {
    execFile("python3", [script, cmd], { encoding: "utf8", timeout: 15000, env }, (err, stdout) => {
      try {
        resolve(err ? null : JSON.parse(stdout));
      } catch {
        resolve(null);
      }
    });
  });
}

export const jobsInstalled = (): boolean => scheduleScript() != null;
export const jobsStatus = async (): Promise<JobsStatus | null> => (await call("status")) as JobsStatus | null;
export const jobsRun = async (): Promise<string> => String((await call("run"))?.result ?? "플러그인에 dobby-jobs 가 없습니다");

export function readJobsData(): JobsData | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(getDocsRoot(), "_dobby-jobs/latest.json"), "utf8"));
  } catch {
    return null;
  }
}

/** 서버가 켜질 때 한 번, 그 뒤 1분마다 schedule.py tick. 실제로 돌지는 schedule.py 가 정한다. */
export function startJobsScheduler(): void {
  const g = globalThis as unknown as { __dobbyJobsTimer?: NodeJS.Timeout };
  if (g.__dobbyJobsTimer) return;
  void call("tick");
  g.__dobbyJobsTimer = setInterval(() => void call("tick"), 60_000);
  g.__dobbyJobsTimer.unref?.();
}

export function teamJobsCardStats(): CardStats {
  const d = readJobsData();
  if (!d) return { overall: [{ label: "조사 기록 없음", value: 0 }], today: [] };
  const picked = d.issues.filter((i) => i.picked).length;
  const crit = d.overlaps.filter((o) => o.level === "충돌 주의").length;
  return {
    overall: [
      { label: "진행 중", value: d.issues.filter((i) => i.status === "진행 중").length, color: "blue" },
      { label: "내 오더와 충돌 주의", value: crit, color: crit ? "red" : undefined },
    ],
    today: d.mode === "daily" ? [{ label: "바뀐 이슈", value: picked }] : [],
  };
}

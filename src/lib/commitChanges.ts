import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { FileDiff, EditHunk } from "@/lib/orchestration";
import type { WorktreeRow } from "@/lib/parseOrderStatus";
import { sectionBody } from "@/lib/parseOrderStatus";
import { getDefaultBase } from "@/lib/issues";

/**
 * 작업 브랜치의 커밋별 코드 변경.
 *
 * 왜 git 인가: 대화 기록은 편집 도구(Edit·Write) 호출만 남기므로, 셸로 고친 파일이 통째로
 * 빠진다(사례 FE1-2139: 구현 세션이 셸로 34번 파일을 썼고 편집 도구는 0번). git 커밋은
 * 고친 방법과 상관없이 남는다. v2 는 통합할 때마다 커밋하므로 커밋 하나가 "통합 한 번"이다.
 */
export type CommitChange = {
  sha: string;
  short: string;
  subject: string;
  /** 커밋 시각(로컬, "YYYY-MM-DD HH:MM") */
  at: string;
  /** 이 커밋에 담긴 세션 단계(상태 문서 "지난 세션" 표에서 직전 커밋 뒤 ~ 이 커밋까지) */
  sessions: string[];
  files: string[];
  diffs: FileDiff[];
};

export type RepoCommitChanges = {
  repo: string;
  path: string;
  /** 비교 기준 설명(예: "feature/FE1-1790 에서 만든 시점") */
  baseLabel: string;
  /** 기준과 지금 워크트리 전체 비교(커밋 전 변경 포함) */
  total: { files: string[]; diffs: FileDiff[] };
  /** 오래된 것부터 */
  commits: CommitChange[];
  /** 아직 커밋하지 않은 변경. 없으면 null */
  uncommitted: { files: string[]; diffs: FileDiff[]; sessions: string[] } | null;
};

/** 한 파일의 diff 본문 상한(lock 파일 같은 거대 변경 방어). 넘으면 파일 목록에만 남긴다. */
const MAX_FILE_DIFF_BYTES = 256 * 1024;

export function git(wt: string, args: string[]): string | null {
  const r = spawnSync("git", ["-C", wt, "-c", "core.quotepath=off", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

/**
 * 작업 브랜치를 만든 시점의 커밋과 그 설명.
 * 브랜치 기록(reflog)의 첫 줄 "branch: Created from X" 가 정확한 출발점이다. 오더마다 기준
 * 브랜치가 달라서(FE1-2139 는 feature/FE1-1790) 기본 기준과 merge-base 를 구하면 남의 커밋이
 * 섞인다. 기록이 없으면(다른 곳에서 받아 온 브랜치) 기본 기준과의 merge-base 로 대신한다.
 */
export function branchStart(wt: string): { sha: string; label: string } | null {
  const branch = git(wt, ["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
  if (branch && branch !== "HEAD") {
    const lines = (git(wt, ["reflog", "show", "--format=%H %gs", branch]) ?? "").trim().split("\n");
    const first = lines[lines.length - 1] ?? "";
    const m = first.match(/^([0-9a-f]{40}) branch: Created from (.+)$/);
    if (m) return { sha: m[1], label: `${m[2]} 에서 브랜치를 만든 시점` };
  }
  const base = getDefaultBase();
  for (const ref of [`origin/${base}`, base]) {
    const sha = git(wt, ["merge-base", ref, "HEAD"])?.trim();
    if (sha) return { sha, label: `${ref} 와 갈라진 시점` };
  }
  return null;
}

/**
 * `-U0` 통합 diff 를 파일별 덩어리로 나눈다. 덩어리마다 지운 줄은 old, 더한 줄은 new 로 담는다
 * (화면의 DiffView 가 old 를 빨강, new 를 초록으로 그린다).
 */
function parseUnifiedDiff(text: string): { files: string[]; diffs: FileDiff[] } {
  const files: string[] = [];
  const diffs: FileDiff[] = [];
  let file = "";
  let hunks: EditHunk[] = [];
  let cur: { old: string[]; new: string[] } | null = null;
  let size = 0;
  const flushHunk = () => {
    if (cur && (cur.old.length || cur.new.length)) hunks.push({ old: cur.old.join("\n"), new: cur.new.join("\n") });
    cur = null;
  };
  const flushFile = () => {
    flushHunk();
    if (file) {
      files.push(file);
      if (hunks.length && size <= MAX_FILE_DIFF_BYTES) diffs.push({ file, hunks });
    }
    file = "";
    hunks = [];
    size = 0;
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flushFile();
      // 경로에 공백이 있어도 a/와 b/가 같은 경로라는 점으로 자른다(이름 바꾸기는 아래 +++ 가 고친다).
      const rest = line.slice("diff --git a/".length);
      file = rest.slice(0, (rest.length - 3) / 2);
      continue;
    }
    if (!file) continue;
    if (line.startsWith("@@")) {
      flushHunk();
      cur = { old: [], new: [] };
      continue;
    }
    if (!cur) {
      if (line.startsWith("+++ b/")) file = line.slice(6);
      continue;
    }
    if (line.startsWith("-")) cur.old.push(line.slice(1));
    else if (line.startsWith("+")) cur.new.push(line.slice(1));
    else continue;
    size += line.length;
  }
  flushFile();
  return { files, diffs };
}

// 이름 바꾸기는 지우기와 새로 만들기로 나눠 받는다(파일 이름을 diff 머리줄에서 바로 읽기 위해).
const DIFF_OPTS = ["--no-color", "--no-ext-diff", "--no-renames", "-U0"];

/** 커밋하지 않은 새 파일(git 이 아직 모르는 파일)을 통째로 더한 줄로 담는다. */
function untracked(wt: string): { files: string[]; diffs: FileDiff[] } {
  const names = (git(wt, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n").filter(Boolean);
  const diffs: FileDiff[] = [];
  for (const name of names) {
    try {
      const abs = path.join(wt, name);
      if (fs.statSync(abs).size > MAX_FILE_DIFF_BYTES) continue;
      diffs.push({ file: name, hunks: [{ old: "", new: fs.readFileSync(abs, "utf8") }] });
    } catch {
      /* 읽을 수 없는 파일은 목록에만 남긴다 */
    }
  }
  return { files: names, diffs };
}

type SessionRow = { at: string; step: string; path: string };

/** 상태 문서 "## 지난 세션" 표: | 시각 | 단계 | 세션 아이디 | 작업 경로 | */
function pastSessions(statusMd: string): SessionRow[] {
  const out: SessionRow[] = [];
  for (const line of sectionBody(statusMd, /^지난 세션/).split("\n")) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2 || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cells[0])) continue;
    out.push({ at: cells[0], step: cells[1], path: cells[3] ?? "" });
  }
  return out;
}

function repoChanges(wt: WorktreeRow, sessions: SessionRow[]): RepoCommitChanges | null {
  if (!wt.path || !fs.existsSync(wt.path)) return null;
  const start = branchStart(wt.path);
  if (!start) return null;

  // 브랜치 자기 줄기(--first-parent)만 본다. 중간에 기준 브랜치를 합쳐 들어온 남의 커밋은 뺀다.
  const log = git(wt.path, [
    "log",
    "--first-parent",
    "--no-merges",
    "--reverse",
    "--date=format-local:%Y-%m-%d %H:%M",
    "--format=%H%x09%h%x09%cd%x09%s",
    `${start.sha}..HEAD`,
  ]);
  const mine = sessions.filter((s) => !s.path || s.path === wt.path);
  const commits: CommitChange[] = [];
  let prevAt = "";
  for (const line of (log ?? "").split("\n")) {
    const [sha, short, at, ...subj] = line.split("\t");
    if (!sha || !at) continue;
    const { files, diffs } = parseUnifiedDiff(git(wt.path, ["show", ...DIFF_OPTS, "--format=", sha]) ?? "");
    const inRange = mine.filter((s) => s.at > prevAt && s.at <= at);
    commits.push({ sha, short, subject: subj.join("\t"), at, sessions: inRange.map((s) => s.step), files, diffs });
    prevAt = at;
  }

  const pending = parseUnifiedDiff(git(wt.path, ["diff", ...DIFF_OPTS, "HEAD"]) ?? "");
  const extra = untracked(wt.path);
  const pendingFiles = [...pending.files, ...extra.files];
  const uncommitted = pendingFiles.length
    ? { files: pendingFiles, diffs: [...pending.diffs, ...extra.diffs], sessions: mine.filter((s) => s.at > prevAt).map((s) => s.step) }
    : null;

  if (commits.length === 0 && !uncommitted) return null;
  const committed = parseUnifiedDiff(git(wt.path, ["diff", ...DIFF_OPTS, start.sha]) ?? "");
  return {
    repo: wt.repo,
    path: wt.path,
    baseLabel: start.label,
    total: {
      files: [...committed.files, ...extra.files],
      diffs: [...committed.diffs, ...extra.diffs],
    },
    commits,
    uncommitted,
  };
}

/** 오더의 워크트리마다 커밋별 변경을 만든다. git 을 여러 번 부르므로 `/changes` 화면에서만 쓴다. */
export function buildCommitChanges(statusMd: string, worktrees: WorktreeRow[]): RepoCommitChanges[] {
  const sessions = pastSessions(statusMd);
  return worktrees.map((wt) => repoChanges(wt, sessions)).filter((r): r is RepoCommitChanges => r !== null);
}

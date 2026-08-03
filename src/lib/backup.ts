/**
 * Claude 세션 전사(~/.claude/projects) 증분 압축 백업 상태/실행. (서버 전용, node I/O)
 * 기준점 = "가장 최신 백업 아카이브 파일명의 시각"(별도 마커 없음) — 스크립트와 동일 규약.
 * 백업 스크립트: ~/.claude/backup-claude-projects.sh
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const HOME = os.homedir();
const SRC = path.join(HOME, ".claude", "projects");
const DEST = process.env.CLAUDE_BACKUP_DIR || path.join(HOME, "claude-projects-backup");
const SCRIPT = path.join(HOME, ".claude", "backup-claude-projects.sh");
const LOCK = path.join(DEST, ".backup-running");
const RUN_LOG = path.join(DEST, "backup-run.log");

/** 백업 저장 위치(표시용). */
export function backupDir(): string {
  return DEST;
}

/** 미백업 1개 이상이면 "백업하기" 버튼 노출. */
export const BACKUP_BUTTON_THRESHOLD = 1;
/** 미백업 10개 이상이면 페이지 진입 시 백그라운드 자동 백업. */
export const BACKUP_AUTO_THRESHOLD = 10;

const ARCHIVE_RE = /^claude-projects-[A-Za-z]+-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.tar\./;

export type BackupStatus = {
  /** 가장 최신 백업 아카이브의 시각(ISO). 하나도 없으면 null. */
  lastBackupAt: string | null;
  /** 최신 아카이브 이후 새로 생기거나 수정된 세션 전사 수. */
  pending: number;
  /** 백업 진행 중 여부. */
  running: boolean;
  buttonThreshold: number;
  autoThreshold: number;
};

/** DEST의 아카이브 파일명들에서 가장 최신 시각(ms). 없으면 null. */
function latestArchiveMs(): number | null {
  let files: string[];
  try {
    files = fs.readdirSync(DEST);
  } catch {
    return null;
  }
  let max: number | null = null;
  for (const f of files) {
    const m = f.match(ARCHIVE_RE);
    if (!m) continue;
    const [, y, mo, d, h, mi, s] = m;
    const ms = new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
    if (max === null || ms > max) max = ms;
  }
  return max;
}

/** ~/.claude/projects/{프로젝트}/{세션}.jsonl 중 since 이후 수정분 수(세션 단위). since=null이면 전체. */
function countPending(since: number | null): number {
  let n = 0;
  let projs: fs.Dirent[];
  try {
    projs = fs.readdirSync(SRC, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const p of projs) {
    if (!p.isDirectory()) continue;
    let files: fs.Dirent[];
    try {
      files = fs.readdirSync(path.join(SRC, p.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
      if (since === null) {
        n++;
        continue;
      }
      try {
        if (fs.statSync(path.join(SRC, p.name, f.name)).mtimeMs > since) n++;
      } catch {
        /* skip */
      }
    }
  }
  return n;
}

export type BackupFile = {
  name: string;
  /** FULL | INCR */
  kind: string;
  /** 아카이브 시각(ISO, 파일명 기준) */
  at: string;
  sizeBytes: number;
  /** 로그에서 얻은 이 아카이브의 파일 수(없으면 null) */
  files: number | null;
};

/** DEST의 백업 아카이브 목록(최신순) + 총 용량 + 원본 로그. */
export function listBackups(): { archives: BackupFile[]; totalBytes: number; log: string } {
  let names: string[];
  try {
    names = fs.readdirSync(DEST);
  } catch {
    return { archives: [], totalBytes: 0, log: "" };
  }
  // 로그에서 아카이브별 파일 수 파싱: "일시 | KIND | N files | size | 파일명"
  let log = "";
  const counts: Record<string, number> = {};
  try {
    log = fs.readFileSync(path.join(DEST, "backup-log.txt"), "utf8");
    for (const line of log.split("\n")) {
      const m = line.match(/\|\s*(\d+)\s+files\s*\|[^|]*\|\s*(claude-projects-\S+)/);
      if (m) counts[m[2].trim()] = Number(m[1]);
    }
  } catch {
    /* 로그 없음 */
  }
  const archives: BackupFile[] = [];
  let total = 0;
  for (const name of names) {
    const m = name.match(ARCHIVE_RE);
    if (!m) continue;
    const [, y, mo, d, h, mi, s] = m;
    const kind = name.match(/^claude-projects-([A-Za-z]+)-/)?.[1] ?? "?";
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(path.join(DEST, name)).size;
    } catch {
      /* skip */
    }
    total += sizeBytes;
    archives.push({
      name,
      kind,
      at: new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString(),
      sizeBytes,
      files: counts[name] ?? null,
    });
  }
  archives.sort((a, b) => b.at.localeCompare(a.at));
  return { archives, totalBytes: total, log };
}

/** 락 파일이 있고 10분 이내면 진행 중으로 본다(오래된 락은 무시). */
export function isBackupRunning(): boolean {
  try {
    const st = fs.statSync(LOCK);
    return Date.now() - st.mtimeMs < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export function getBackupStatus(): BackupStatus {
  const since = latestArchiveMs();
  return {
    lastBackupAt: since ? new Date(since).toISOString() : null,
    pending: countPending(since),
    running: isBackupRunning(),
    buttonThreshold: BACKUP_BUTTON_THRESHOLD,
    autoThreshold: BACKUP_AUTO_THRESHOLD,
  };
}

/** 백업 스크립트를 백그라운드(detached)로 실행. 락으로 중복 방지, 종료 시 락 제거. */
export function runBackup(): { ok: boolean; reason?: string } {
  if (!fs.existsSync(SCRIPT)) return { ok: false, reason: "no_script" };
  if (isBackupRunning()) return { ok: false, reason: "already_running" };
  try {
    fs.mkdirSync(DEST, { recursive: true });
    fs.writeFileSync(LOCK, String(Date.now()));
    const child = spawn(
      "/bin/sh",
      ["-c", `'${SCRIPT}' '${DEST}' >> '${RUN_LOG}' 2>&1; rm -f '${LOCK}'`],
      { detached: true, stdio: "ignore" }
    );
    child.unref();
    return { ok: true };
  } catch {
    try {
      fs.rmSync(LOCK, { force: true });
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "spawn_failed" };
  }
}

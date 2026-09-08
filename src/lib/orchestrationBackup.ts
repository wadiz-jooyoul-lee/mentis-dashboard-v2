/**
 * 오케스트레이션 메타 백업 현황 읽기 + 일괄 백업 실행. (서버 전용, node I/O)
 *
 * 아카이브는 go-dobby의 `dobby-meta-backup.sh`가 만든다(해결 처리 시 자동, `--all`로 일괄).
 * 이름 규칙 `{폴더이름}--{YYYYMMDD-HHMMSS}.tar.zst` 하나에 필요한 정보가 다 들어 있어
 * 별도 색인 파일을 두지 않는다 — 폴더 목록 + backup-log.txt만 읽는다(상위 세션 백업과 같은 방식).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { getMetaDir } from "@/lib/issues";
import { goDobbyLib } from "@/lib/jobs";

const DEST =
  process.env.ORCHESTRATION_BACKUP_DIR ||
  path.join(os.homedir(), "claude-projects-backup", "orchestration");

const ARCHIVE_RE = /^(.+)--(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.tar\.(zst|gz)$/;
/** 백업에서 빠지는 확장자(스크립트의 exclude.txt와 같은 목록) — 변경 감지에서도 제외한다. */
const SKIP_EXT = new Set([".png", ".jpeg", ".jpg", ".gif", ".webp", ".bin"]);

export function orchestrationBackupDir(): string {
  return DEST;
}

export type OrchArchive = {
  /** 메타 폴더 이름 = 오더 키 */
  key: string;
  name: string;
  /** 아카이브 시각(ISO, 파일명 기준) */
  at: string;
  sizeBytes: number;
  /** 로그에서 얻은 원본 크기·파일 수·배율(없으면 null) */
  rawBytes: number | null;
  files: number | null;
  ratio: number | null;
  /** 아카이브 이후 폴더의 텍스트가 바뀌었나 */
  stale: boolean;
};

export type OrchBackupStatus = {
  dest: string;
  metaDir: string;
  archives: OrchArchive[];
  totalBytes: number;
  /** 메타 폴더 수(숨김 폴더 제외) */
  orders: number;
  /** 아카이브가 아직 없는 폴더 수 */
  missing: number;
  /** 아카이브가 있지만 그 뒤로 바뀐 폴더 수 */
  stale: number;
  running: boolean;
  log: string;
};

/** "1000.0K" · "37K" · "1.2M" 같은 표기를 바이트로. 못 읽으면 null. */
function parseSize(s: string): number | null {
  const m = s.trim().match(/^([\d.]+)\s*([BKMG])$/i);
  if (!m) return null;
  const mult = { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase()] ?? 1;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

/** backup-log.txt에서 아카이브별 (원본크기·파일수·배율)을 뽑는다. */
function readLog(): { log: string; meta: Record<string, { raw: number | null; files: number | null; ratio: number | null }> } {
  let log = "";
  const meta: Record<string, { raw: number | null; files: number | null; ratio: number | null }> = {};
  try {
    log = fs.readFileSync(path.join(DEST, "backup-log.txt"), "utf8");
  } catch {
    return { log: "", meta };
  }
  // "일시 | 키 | N files | 원본 → 압축 (M x) | 파일명"
  const re = /\|\s*(\d+)\s+files\s*\|\s*([\d.]+[BKMG])\s*→\s*([\d.]+[BKMG])\s*\(([\d.]+)x\)\s*\|\s*(\S+)/;
  for (const line of log.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    meta[m[5].trim()] = {
      files: Number(m[1]),
      raw: parseSize(m[2]),
      ratio: Number(m[4]) || null,
    };
  }
  return { log, meta };
}

/**
 * 백업 대상 폴더인가 — dobby-meta-backup.sh 의 건너뛰기 규칙과 같은 판정.
 *   ① 폴더 이름이 오더 키 형식이어야 한다(이름이 그대로 아카이브 파일명이 되므로).
 *      이벤트 메시지가 키 자리에 들어가 공백 든 폴더가 생긴 사례가 있다.
 *   ② 파일이 하나라도 있어야 한다(빈 폴더는 담을 게 없다).
 */
function isBackupTarget(metaDir: string, name: string): boolean {
  const ok = name.startsWith("TASK-")
    ? /^TASK-[A-Za-z0-9._-]+$/.test(name)
    : /^[A-Z][A-Za-z0-9]*-\d+(-[A-Za-z0-9]+)*$/.test(name);
  if (!ok) return false;
  return hasAnyFile(path.join(metaDir, name));
}

function hasAnyFile(dir: string): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile()) return true;
    if (e.isDirectory() && hasAnyFile(path.join(dir, e.name))) return true;
  }
  return false;
}

/** 폴더 안 텍스트 파일 중 ms 이후 수정된 것이 있나(이미지는 백업 대상이 아니라 제외). */
function hasChangeSince(dir: string, ms: number): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (hasChangeSince(p, ms)) return true;
      continue;
    }
    if (!e.isFile()) continue;
    if (SKIP_EXT.has(path.extname(e.name).toLowerCase())) continue;
    try {
      if (fs.statSync(p).mtimeMs > ms) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** 락 파일이 있고 10분 이내면 진행 중으로 본다(상위 세션 백업과 같은 규약). */
export function isOrchestrationBackupRunning(): boolean {
  let names: string[];
  try {
    names = fs.readdirSync(DEST);
  } catch {
    return false;
  }
  const now = Date.now();
  for (const n of names) {
    if (!n.startsWith(".lock-")) continue;
    try {
      if (now - fs.statSync(path.join(DEST, n)).mtimeMs < 10 * 60 * 1000) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

export function getOrchestrationBackupStatus(): OrchBackupStatus {
  const metaDir = getMetaDir();
  const { log, meta } = readLog();

  // 아카이브 목록 — 같은 키가 둘 이상이면(교체 직전 등) 최신만 남긴다.
  const latest = new Map<string, OrchArchive>();
  let names: string[] = [];
  try {
    names = fs.readdirSync(DEST);
  } catch {
    /* 폴더 없음 = 아직 백업 안 함 */
  }
  for (const name of names) {
    const m = name.match(ARCHIVE_RE);
    if (!m) continue;
    const [, key, y, mo, d, h, mi, s] = m;
    const at = new Date(+y, +mo - 1, +d, +h, +mi, +s);
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(path.join(DEST, name)).size;
    } catch {
      /* skip */
    }
    const info = meta[name] ?? { raw: null, files: null, ratio: null };
    const row: OrchArchive = {
      key,
      name,
      at: at.toISOString(),
      sizeBytes,
      rawBytes: info.raw,
      files: info.files,
      ratio: info.ratio,
      stale: hasChangeSince(path.join(metaDir, key), at.getTime()),
    };
    const prev = latest.get(key);
    if (!prev || prev.at < row.at) latest.set(key, row);
  }

  // 백업 대상 폴더 수 — 스크립트가 건너뛰는 것(빈 폴더·키 형식 아님)은 세지 않는다.
  // 그래야 "미백업 N개"가 "아직 안 된 것"을 뜻한다(건너뛴 쓰레기 폴더가 섞이면 늘 0이 안 됨).
  let orders = 0;
  try {
    for (const e of fs.readdirSync(metaDir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      if (!isBackupTarget(metaDir, e.name)) continue;
      orders++;
    }
  } catch {
    /* 메타 없음 */
  }

  const archives = [...latest.values()].sort((a, b) => b.at.localeCompare(a.at));
  return {
    dest: DEST,
    metaDir,
    archives,
    totalBytes: archives.reduce((n, a) => n + a.sizeBytes, 0),
    orders,
    missing: Math.max(0, orders - archives.length),
    stale: archives.filter((a) => a.stale).length,
    running: isOrchestrationBackupRunning(),
    log,
  };
}

/** `dobby-meta-backup.sh --all`을 백그라운드(detached)로 실행. */
export function runOrchestrationBackupAll(): { ok: boolean; reason?: string } {
  if (isOrchestrationBackupRunning()) return { ok: false, reason: "already_running" };
  const lib = goDobbyLib();
  if (!lib) return { ok: false, reason: "no_plugin" };
  const script = path.join(path.dirname(lib), "dobby-meta-backup.sh");
  if (!fs.existsSync(script)) return { ok: false, reason: "no_script" };
  try {
    fs.mkdirSync(DEST, { recursive: true });
    const out = fs.openSync(path.join(DEST, "backup-run.log"), "a");
    const child = spawn("bash", [script, "--all"], {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, ORCHESTRATION_BACKUP_DIR: DEST },
    });
    child.unref();
    return { ok: true };
  } catch {
    return { ok: false, reason: "spawn_failed" };
  }
}

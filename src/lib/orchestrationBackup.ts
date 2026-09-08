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

/** 스크립트 실행 원본 출력(backup-run.log). 최근 것만 본다 — 계속 덧붙는 파일이다. */
export function readRunLog(maxBytes = 20000): string {
  const p = path.join(DEST, "backup-run.log");
  try {
    const size = fs.statSync(p).size;
    const start = Math.max(0, size - maxBytes);
    const fd = fs.openSync(p, "r");
    try {
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      const text = buf.toString("utf8");
      // 앞이 잘렸으면 깨진 첫 줄은 버린다.
      return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
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

// ── 진행중(작업중) 백업 ────────────────────────────────────────────────
// 해결 전에는 폴더별 아카이브가 갱신되지 않으므로(해결 시점에만 만든다) 그 사이 변경이
// 무방비다. 작업중인 폴더들을 하루 두 번 한 덩이로 모아 임시 보관한다.

const INP_DIR = path.join(DEST, "inprogress");
const INP_RE = /^inprogress-(\d{4})(\d{2})(\d{2})-(am|pm)\.tar\.(zst|gz)$/;
/** 보관 기간(일). 스크립트의 ORCHESTRATION_BACKUP_KEEP_DAYS 기본값과 같아야 한다. */
export const INP_KEEP_DAYS = Number(process.env.ORCHESTRATION_BACKUP_KEEP_DAYS || 14);

export type InProgressSlot = "am" | "pm";

export type InProgressArchive = {
  name: string;
  /** YYYYMMDD */
  day: string;
  slot: InProgressSlot;
  /** 실제 실행 시각(파일 수정 시각) */
  at: string;
  sizeBytes: number;
  orders: number | null;
  files: number | null;
  rawBytes: number | null;
  ratio: number | null;
};

export type InProgressStatus = {
  dir: string;
  archives: InProgressArchive[];
  totalBytes: number;
  keepDays: number;
  /** 오늘(YYYYMMDD) */
  today: string;
  /** 오늘 회차별 보유 여부 */
  has: { am: boolean; pm: boolean };
  /**
   * 지금 시각에 있어야 하는 회차. 오전 10시 전이면 null.
   * 오후 3시 이후에 그날 처음 돌면 오후 회차 하나만 만든다(오전은 그날 건너뛴 것으로 둔다).
   * ⛔ 이 규칙은 스크립트의 _inprogress_slot 과 같아야 한다.
   */
  dueSlot: InProgressSlot | null;
  /** 있어야 할 회차가 아직 없나 */
  due: boolean;
  running: boolean;
  log: string;
};

function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function currentSlot(d = new Date()): InProgressSlot | null {
  const h = d.getHours();
  if (h >= 15) return "pm";
  if (h >= 10) return "am";
  return null;
}

/** inprogress-log.txt에서 아카이브별 (오더 수·파일 수·원본·배율)을 뽑는다. */
function readInProgressLog(): {
  log: string;
  meta: Record<string, { orders: number | null; files: number | null; raw: number | null; ratio: number | null }>;
} {
  let log = "";
  const meta: Record<string, { orders: number | null; files: number | null; raw: number | null; ratio: number | null }> = {};
  try {
    log = fs.readFileSync(path.join(INP_DIR, "inprogress-log.txt"), "utf8");
  } catch {
    return { log: "", meta };
  }
  // "일시 | 20260909-pm | N orders | M files | 원본 → 압축 (Rx) | 파일명"
  const re =
    /\|\s*(\d+)\s+orders\s*\|\s*(\d+)\s+files\s*\|\s*([\d.]+[BKMG])\s*→\s*([\d.]+[BKMG])\s*\(([\d.]+)x\)\s*\|\s*(\S+)/;
  for (const line of log.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    meta[m[6].trim()] = {
      orders: Number(m[1]),
      files: Number(m[2]),
      raw: parseSize(m[3]),
      ratio: Number(m[5]) || null,
    };
  }
  return { log, meta };
}

export function getInProgressStatus(now = new Date()): InProgressStatus {
  const { log, meta } = readInProgressLog();
  const archives: InProgressArchive[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(INP_DIR);
  } catch {
    /* 아직 없음 */
  }
  for (const name of names) {
    const m = name.match(INP_RE);
    if (!m) continue;
    const [, y, mo, d, slot] = m;
    let sizeBytes = 0;
    let at = new Date(+y, +mo - 1, +d).toISOString();
    try {
      const st = fs.statSync(path.join(INP_DIR, name));
      sizeBytes = st.size;
      at = new Date(st.mtimeMs).toISOString();
    } catch {
      /* skip */
    }
    const info = meta[name] ?? { orders: null, files: null, raw: null, ratio: null };
    archives.push({
      name,
      day: `${y}${mo}${d}`,
      slot: slot as InProgressSlot,
      at,
      sizeBytes,
      orders: info.orders,
      files: info.files,
      rawBytes: info.raw,
      ratio: info.ratio,
    });
  }
  archives.sort((a, b) => (b.day + b.slot).localeCompare(a.day + a.slot));

  const today = todayStr(now);
  const has = {
    am: archives.some((a) => a.day === today && a.slot === "am"),
    pm: archives.some((a) => a.day === today && a.slot === "pm"),
  };
  const dueSlot = currentSlot(now);
  return {
    dir: INP_DIR,
    archives,
    totalBytes: archives.reduce((n, a) => n + a.sizeBytes, 0),
    keepDays: INP_KEEP_DAYS,
    today,
    has,
    dueSlot,
    due: dueSlot != null && !has[dueSlot],
    running: isOrchestrationBackupRunning(),
    log,
  };
}

/**
 * 있어야 할 회차가 없으면 백그라운드로 만든다. 대시보드가 30초마다 두드리므로
 * "이미 있으면 즉시 반환"이 싸야 한다 — 디렉터리 읽기 1회로 끝난다.
 */
export function maybeRunInProgressBackup(
  now = new Date(),
  /**
   * 사용자가 버튼으로 직접 부른 경우. 회차 시각(오전 10시) 전이라도 그날 첫 회차(오전)로
   * 만든다 — 자동 트리거는 시각을 지키지만, 사람이 누른 것은 그 자체가 의도다.
   */
  manual = false,
): {
  ok: boolean;
  ran: boolean;
  slot: InProgressSlot | null;
  reason?: string;
} {
  const slot = currentSlot(now) ?? (manual ? "am" : null);
  if (!slot) return { ok: true, ran: false, slot: null, reason: "before_10" };
  const s = getInProgressStatus(now);
  if (s.has[slot]) return { ok: true, ran: false, slot, reason: "already_done" };
  if (s.running) return { ok: true, ran: false, slot, reason: "already_running" };

  const lib = goDobbyLib();
  if (!lib) return { ok: false, ran: false, slot, reason: "no_plugin" };
  const script = path.join(path.dirname(lib), "dobby-meta-backup.sh");
  if (!fs.existsSync(script)) return { ok: false, ran: false, slot, reason: "no_script" };
  try {
    fs.mkdirSync(INP_DIR, { recursive: true });
    const out = fs.openSync(path.join(DEST, "backup-run.log"), "a");
    const child = spawn("bash", [script, "--inprogress", slot], {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, ORCHESTRATION_BACKUP_DIR: DEST },
    });
    child.unref();
    return { ok: true, ran: true, slot };
  } catch {
    return { ok: false, ran: false, slot, reason: "spawn_failed" };
  }
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

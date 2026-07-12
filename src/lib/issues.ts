/**
 * go-dobby 테스트 실행(회차) 리더. (서버 전용, node I/O)
 * 회차: `$DOBBY_META/{키}/test-runs/{YYYYMMDD-HHMMSS}/result.md` (dobby-test, 덮어쓰지 않음).
 * ReportRun 타입·getReportRuns 시그니처는 기존 IssueReport 컴포넌트가 그대로 쓴다.
 */
import fs from "node:fs";
import path from "node:path";
import { getMetaDir, orderDir } from "@/lib/config";

export type ReportRun = {
  /** 회차 식별자(시각 폴더명) */
  id: string;
  /** 표시용 라벨(사람이 읽는 일시) */
  label: string;
  /** md 파일의 상대 표시 경로 */
  file: string;
  /** md 원문 */
  content: string;
  /** 정렬용 epoch(ms) */
  sortKey: number;
};

/**
 * 시각 폴더명을 파싱한다(형식 관대하게).
 * 지원: 20260708-084455 / 2026-07-08_142338 / 2026-07-08-142338 등.
 */
function parseRunTimestamp(folder: string): { label: string; epoch: number } | null {
  const m = folder.match(/(\d{4})-?(\d{2})-?(\d{2})[-_ ]?(\d{2}):?(\d{2}):?(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const epoch = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  ).getTime();
  return { label: `${y}-${mo}-${d} ${h}:${mi}:${s}`, epoch };
}

/** 폴더 안의 md 파일들(하위 1단계까지). */
function markdownIn(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(p);
    else if (e.isDirectory()) {
      try {
        for (const f of fs.readdirSync(p))
          if (f.toLowerCase().endsWith(".md")) out.push(path.join(p, f));
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

/**
 * 이슈/작업의 모든 테스트 회차를 최신순으로 읽는다.
 * `$DOBBY_META/{키}/test-runs/{시각}/result.md` 우선, 없으면 그 폴더의 첫 md.
 * 결과가 없으면 빈 배열.
 */
export function getReportRuns(key: string): ReportRun[] {
  const root = getMetaDir();
  const runsDir = path.join(orderDir(key), "test-runs");
  if (!fs.existsSync(runsDir)) return [];

  const runs: ReportRun[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(runsDir, entry.name);
    const mds = markdownIn(runDir);
    const md = mds.find((f) => /result/i.test(path.basename(f))) ?? mds[0];
    if (!md) continue;
    const ts = parseRunTimestamp(entry.name);
    let content = "";
    try {
      content = fs.readFileSync(md, "utf8");
    } catch {
      continue;
    }
    runs.push({
      id: entry.name,
      label: ts ? ts.label : entry.name,
      file: path.relative(root, md),
      content,
      sortKey: ts ? ts.epoch : 0,
    });
  }
  runs.sort((a, b) => b.sortKey - a.sortKey);
  return runs;
}

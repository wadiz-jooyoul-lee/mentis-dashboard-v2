import fs from "node:fs";
import path from "node:path";
import { getMetaDir, listIssues, type IssueSummary } from "@/lib/issues";
import { parseStart, type IssueStart } from "@/lib/parseStart";
import { parseEnd, type IssueEnd } from "@/lib/parseEnd";

export function getStartDir(): string {
  return process.env.ISSUE_START_DIR || path.join(getMetaDir(), ".issue-start");
}
export function getEndDir(): string {
  return process.env.ISSUE_END_DIR || path.join(getMetaDir(), ".issue-end");
}

function readIssueMd(dir: string, key: string, filename: string): string | null {
  const p = path.join(dir, key, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function issueDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

// ---- issue-start ----

export function getStart(key: string): IssueStart | null {
  const md = readIssueMd(getStartDir(), key, "status.md");
  if (!md) return null;
  const parsed = parseStart(md);
  if (!parsed.key) parsed.key = key;
  return parsed;
}

export function listStarts(): IssueStart[] {
  // 단독 issue-start만. work-dobby 하위이슈(orchestrated)는 오케스트레이션 섹션에서 다룬다.
  const starts = issueDirs(getStartDir())
    .map((key) => getStart(key))
    .filter((s): s is IssueStart => s !== null)
    .filter((s) => s.origin !== "orchestrated");
  starts.sort((a, b) =>
    (b.updatedAt ?? b.startedAt ?? "").localeCompare(
      a.updatedAt ?? a.startedAt ?? ""
    )
  );
  return starts;
}

// ---- issue-end ----

export function getEnd(key: string): IssueEnd | null {
  const md = readIssueMd(getEndDir(), key, "summary.md");
  if (!md) return null;
  const parsed = parseEnd(md);
  if (!parsed.key) parsed.key = key;
  return parsed;
}

export function listEnds(): IssueEnd[] {
  const ends = issueDirs(getEndDir())
    .map((key) => getEnd(key))
    .filter((e): e is IssueEnd => e !== null);
  ends.sort((a, b) => (b.processedAt ?? "").localeCompare(a.processedAt ?? ""));
  return ends;
}

// ---- 생명주기 통합 ----

export type LifecycleRow = {
  key: string;
  title: string | null;
  type: string | null;
  /** 착수 단계 상태(없으면 null) */
  startState: string | null;
  /** 테스트 단계: 진행 상태 or 종합 판정 */
  testState: string | null;
  testOverallColor: string | null;
  /** 종료 단계: 최종 상태 + 워크트리 처리 */
  endFinalStatus: string | null;
  endAction: string | null;
};

export function getLifecycle(): LifecycleRow[] {
  const startMap = new Map(listStarts().map((s) => [s.key, s]));
  const endMap = new Map(listEnds().map((e) => [e.key, e]));
  const testMap = new Map(listIssues().map((t) => [t.key, t]));

  const keys = new Set<string>([
    ...Array.from(startMap.keys()),
    ...Array.from(endMap.keys()),
    ...Array.from(testMap.keys()),
  ]);

  const rows: LifecycleRow[] = [];
  for (const key of Array.from(keys)) {
    const s = startMap.get(key);
    const e = endMap.get(key);
    const t = testMap.get(key);

    let testState: string | null = null;
    let testOverallColor: string | null = null;
    if (t?.status) {
      testState = t.status.state;
    } else if (t?.preview) {
      testState = t.preview.overallLabel;
      testOverallColor = t.preview.overallColor;
    }

    rows.push({
      key,
      title: s?.title ?? e?.title ?? null,
      type: s?.type ?? e?.type ?? null,
      startState: s ? s.state : null,
      testState,
      testOverallColor,
      endFinalStatus: e ? e.finalStatus : null,
      endAction: e ? e.worktreeAction : null,
    });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

// ---- 메인 허브 카드용 요약 지표 ----

export type Metric = {
  label: string;
  value: number;
  /** 오늘자 카운트(없으면 전체만 표시) */
  today?: number;
  color?: string;
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 날짜 문자열이 오늘(로컬)인가. ISO/`YYYY-MM-DD ...` 모두 지원. */
export function isToday(v: string | null | undefined): boolean {
  if (!v) return false;
  const t = ymd(new Date());
  if (/T\d|Z$/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return ymd(d) === t;
  }
  const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}` === t;
  const d = new Date(v);
  return !isNaN(d.getTime()) && ymd(d) === t;
}

/** 섹션 key → 카드에 표시할 요약 지표 목록(전체 + 오늘). */
export function getSectionStats(): Record<string, Metric[]> {
  const starts = listStarts();
  const issues = listIssues();
  const ends = listEnds();

  const stats: Record<string, Metric[]> = {};

  // 이슈 착수
  if (starts.length > 0) {
    const today = starts.filter((s) => isToday(s.updatedAt ?? s.startedAt));
    const cnt = (arr: IssueStart[], st: string) =>
      arr.filter((s) => s.state === st).length;
    const line = (label: string, st: string, color: string): Metric[] =>
      cnt(starts, st) > 0
        ? [{ label, value: cnt(starts, st), today: cnt(today, st), color }]
        : [];
    stats["issue-start"] = [
      { label: "이슈", value: starts.length, today: today.length },
      ...line("해결됨", "해결됨", "green"),
      ...line("분석완료", "분석완료", "blue"),
      ...line("착수", "착수", "orange"),
    ];
  }

  // 이슈 테스트
  if (issues.length > 0) {
    const isPass = (i: IssueSummary) => i.preview?.overallLabel === "통과";
    const isFail = (i: IssueSummary) => (i.preview?.counts.fail ?? 0) > 0;
    const today = issues.filter((i) =>
      isToday(i.preview?.testedAt ?? i.updatedAt)
    );
    const pass = issues.filter(isPass).length;
    const fail = issues.filter(isFail).length;
    const inProg = issues.length - pass - fail;
    const passT = today.filter(isPass).length;
    const failT = today.filter(isFail).length;
    const inProgT = today.length - passT - failT;
    stats["issue-test"] = [
      { label: "이슈", value: issues.length, today: today.length },
      ...(inProg > 0
        ? [{ label: "진행중", value: inProg, today: inProgT, color: "blue" }]
        : []),
      ...(pass > 0
        ? [{ label: "통과", value: pass, today: passT, color: "green" }]
        : []),
      ...(fail > 0
        ? [{ label: "실패", value: fail, today: failT, color: "red" }]
        : []),
    ];
  }

  // 이슈 종료
  if (ends.length > 0) {
    const today = ends.filter((e) => isToday(e.processedAt));
    const cnt = (arr: IssueEnd[], a: string) =>
      arr.filter((e) => e.worktreeAction === a).length;
    const line = (label: string, a: string, color: string): Metric[] =>
      cnt(ends, a) > 0
        ? [{ label, value: cnt(ends, a), today: cnt(today, a), color }]
        : [];
    stats["issue-end"] = [
      { label: "종료", value: ends.length, today: today.length },
      ...line("제거", "제거", "green"),
      ...line("유지", "유지", "orange"),
    ];
  }

  // 생명주기 (전체 이슈 union)
  const union = new Set<string>([
    ...starts.map((s) => s.key),
    ...issues.map((i) => i.key),
    ...ends.map((e) => e.key),
  ]);
  if (union.size > 0) {
    const todayKeys = new Set<string>([
      ...starts
        .filter((s) => isToday(s.updatedAt ?? s.startedAt))
        .map((s) => s.key),
      ...issues
        .filter((i) => isToday(i.preview?.testedAt ?? i.updatedAt))
        .map((i) => i.key),
      ...ends.filter((e) => isToday(e.processedAt)).map((e) => e.key),
    ]);
    stats["lifecycle"] = [
      { label: "전체 이슈", value: union.size, today: todayKeys.size },
    ];
  }

  return stats;
}

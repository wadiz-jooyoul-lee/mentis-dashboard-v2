import fs from "node:fs";
import path from "node:path";
import { getMetaDir } from "@/lib/issues";
import { listEpics } from "@/lib/orchestration";
import { isJiraIssueKey } from "@/lib/keys";
import type { CardStats } from "@/lib/lifecycle";

/** dobby-data 가 `{메타}/{키}/data/` 에 남긴 파일을 읽는다. 홈 카드·/data·오더 데이터 탭이 모두 이 모듈만 읽는다. */

export type DataBadge = "수집 이상" | "성과 있음" | "나빠짐" | "판단 이르다" | "차이 없음" | "수집 확인";

export type DataEvent = { name: string; category: string; action?: string; label?: string; meaning?: string };
export type DataSpec = {
  kind: string;
  title?: string;
  liveDate?: string;
  liveDateSource?: string;
  startAt?: string;
  reason?: string;
  notes?: string;
  events?: DataEvent[];
  daily?: string[];
  metric?: { name: string; direction: "up" | "down" };
};

export type DataSide = { label: string; x?: number; n: number; value: number | null };
export type DataHeadline = {
  metric: string;
  target: DataSide;
  compare: DataSide | null;
  changeRate: number | null;
  p: number | null;
  requiredN: number | null;
};
export type DataSegment = {
  name: string;
  target: DataSide;
  compare: DataSide;
  changeRate: number | null;
  p: number | null;
  badge: DataBadge;
  requiredN: number | null;
};
export type DataSummary = {
  key: string;
  kind: string;
  title: string | null;
  liveDate: string;
  startAt: string;
  coveredUntil: string;
  runs: number;
  lastRunId: string;
  verdict: DataBadge;
  headline: DataHeadline | null;
  segments: DataSegment[];
  daily: { series: string[]; rows: { date: string; values: Record<string, number> }[] };
  tables: {
    funnel: { grp: string | null; step: number; name: string; devices: number }[];
    continuations: { grp: string | null; name: string; fromDevices: number; toDevices: number; rate: number | null }[];
    groups: { grp: string; devices: number; converted: number; rate: number | null }[];
  };
  history: { runId: string; coveredUntil: string; changeRate: number | null; p: number | null; verdict: DataBadge | null }[];
  oneLine: string;
  health: { zeroDays: { date: string; name: string }[]; srmP: number | null; fingerprint: string; anomalyCandidates: number };
};
export type DataRun = { runId: string; from: string; to: string; reset: boolean; done: boolean };
export type DataOrder = {
  key: string;
  spec: DataSpec | null;
  summary: DataSummary | null;
  reportMd: string | null;
  runs: DataRun[];
  nextWindow: { from: string; to: string } | null;
};

const dataDir = (key: string) => path.join(getMetaDir(), key, "data");

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

/** 한국 시간 "YYYY-MM-DD HH:mm:00". */
function kstNow(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:00`;
}

/** 해결 판정 — orchestration.ts getEpic 의 resolved 와 같은 규칙. TASK- 는 대상이 아니다. */
export function isDataTarget(e: { epicKey: string; phase: string; worktreeRemoved: boolean }): boolean {
  return isJiraIssueKey(e.epicKey) && (e.worktreeRemoved || e.phase === "해결" || e.phase === "종료");
}

function listRuns(key: string): DataRun[] {
  const dir = path.join(dataDir(key), "runs");
  let names: string[];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
  const runs: DataRun[] = [];
  for (const runId of names) {
    const w = readJson<{ from: string; to: string; reset: boolean }>(path.join(dir, runId, "window.json"));
    if (!w) continue;
    runs.push({ runId, from: w.from, to: w.to, reset: w.reset, done: fs.existsSync(path.join(dir, runId, "stats.json")) });
  }
  return runs;
}

export function readDataOrder(key: string): DataOrder {
  const dir = dataDir(key);
  const spec = readJson<DataSpec>(path.join(dir, "spec.json"));
  const summary = readJson<DataSummary>(path.join(dir, "summary.json"));
  let reportMd: string | null = null;
  try {
    reportMd = fs.readFileSync(path.join(dir, "report.md"), "utf8");
  } catch {
    /* 없음 */
  }
  const runs = listRuns(key);
  const lastDone = [...runs].reverse().find((r) => r.done);
  const nextWindow =
    spec && spec.kind !== "not_measurable" && spec.startAt
      ? { from: lastDone?.to ?? spec.startAt, to: kstNow() }
      : null;
  return { key, spec, summary, reportMd, runs, nextWindow };
}

export type DataCardItem = DataSummary & { key: string; direction: "up" | "down" };

/** /data 카드 목록: 수집이 한 번 이상 된(summary.json 있는) 해결 오더. 홈 카드와 같은 규칙으로 고른다. 마지막 회차 최신순. 변화율 색을 정하려고 명세의 방향을 함께 싣는다. */
export function listDataCards(): DataCardItem[] {
  const cards: DataCardItem[] = [];
  for (const e of listEpics()) {
    if (!isDataTarget(e)) continue;
    const p = path.join(dataDir(e.epicKey), "summary.json");
    if (!fs.existsSync(p)) continue;
    const s = readJson<DataSummary>(p);
    const spec = readJson<DataSpec>(path.join(dataDir(e.epicKey), "spec.json"));
    if (s) cards.push({ ...s, key: e.epicKey, direction: spec?.metric?.direction ?? "up" });
  }
  return cards.sort((a, b) => (b.lastRunId ?? "").localeCompare(a.lastRunId ?? ""));
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 홈 카드 숫자 */
export function dataCardStats(): CardStats {
  const today = kstNow().slice(0, 10);
  const todayId = today.replace(/-/g, "");
  let analyzed = 0;
  let good = 0;
  let early = 0;
  let broken = 0;
  let due = 0;
  let todayRuns = 0;
  for (const e of listEpics()) {
    if (!isDataTarget(e)) continue;
    const dir = dataDir(e.epicKey);
    if (!fs.existsSync(dir)) continue; // data/ 가 없는 오더는 여기서 끝낸다
    const summary = readJson<DataSummary>(path.join(dir, "summary.json"));
    const done = listRuns(e.epicKey).filter((r) => r.done);
    if (summary) {
      analyzed++;
      if (summary.verdict === "성과 있음") good++;
      if (summary.verdict === "판단 이르다") early++;
      if (summary.verdict === "수집 이상") broken++;
    }
    if (done.some((r) => r.runId.slice(0, 8) === todayId)) todayRuns++;
    if (done.length === 0) {
      const spec = readJson<DataSpec>(path.join(dir, "spec.json"));
      if (spec && spec.kind !== "not_measurable" && spec.liveDate && today >= addDays(spec.liveDate, 14)) due++;
    }
  }
  return {
    overall: [
      { label: "분석됨", value: analyzed, color: "blue" },
      { label: "성과 있음", value: good, color: "green" },
      { label: "판단 이르다", value: early, color: "orange" },
      ...(broken > 0 ? [{ label: "수집 이상", value: broken, color: "red" }] : []),
    ],
    today: [
      { label: "분석할 때 됨", value: due, color: "blue" },
      { label: "오늘 분석", value: todayRuns },
    ],
  };
}

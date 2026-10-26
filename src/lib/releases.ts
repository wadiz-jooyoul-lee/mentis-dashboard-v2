/**
 * 정기배포일별 stage 검증(dobby-stage) 모음. (서버 전용, node I/O)
 *
 * 두 곳에서 모은다.
 * - `$ORCHESTRATION_META/RELEASE-{날짜}/stage.md` — dobby-stage 가 남긴 배포일 목록(이슈·회차 경로).
 * - 목록이 없는 지난 배포일 — 오더 회차 중 환경이 stage 인 것을 배포일로 묶는다.
 * TC 결과는 늘 오더 회차(result.md)에서 읽는다. 목록 파일에는 결과를 적지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { getMetaDir } from "@/lib/issues";
import { parseReport, isHold, type Scenario } from "@/lib/parseReport";
import { findEnv } from "@/lib/testSummary";
import { fieldLine, findTable, columnIndex } from "@/lib/md";
import { parseOrderStatus } from "@/lib/parseOrderStatus";
import { ORDER_KEY_RE } from "@/lib/keys";
import type { CardStats } from "@/lib/lifecycle";

export const RELEASE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_DIR_RE = /^RELEASE-(\d{4}-\d{2}-\d{2})$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 핵심 TC 집계. 처리 = 통과+실패+보류+스킵, 판정 칸이 빈 행은 남음이다. */
export type ReleaseCounts = {
  total: number;
  done: number;
  pass: number;
  fail: number;
  /** `SKIP(미비)` — 준비가 모자라 못 함, 배포 판단에 못 씀 */
  hold: number;
  /** `SKIP(환경)`·`SKIP(위험)` — 한계나 위험으로 건너뜀 */
  skip: number;
};

export type ReleaseTc = Scenario & { /** 이 TC 를 본 오더 회차 번호들 */ runs: number[] };

export type ReleaseIssue = {
  key: string;
  title: string | null;
  /** 릴리즈 노트 표의 행 번호 */
  row: string | null;
  repos: string[];
  /** stage 반영(들어감·미반영). 지난 기록은 시험했으므로 들어감. */
  reflected: string | null;
  /** 릴리즈 노트 stage 칸(체크함·건너뜀·체크 안 함). 모르면 null. */
  stageCheck: string | null;
  note: string | null;
  /** 오더 검증 탭이 있는가(메타 없는 이슈는 RELEASE 폴더 안 회차뿐) */
  hasOrder: boolean;
  runs: { no: number; id: string }[];
  tcs: ReleaseTc[];
  /** `## stage 에서 하지 않은 시험` 절 — 진행률에 넣지 않는 참고 목록 */
  notDone: string[];
  counts: ReleaseCounts;
};

export type Release = {
  date: string;
  weekday: string;
  /** 화·목이 아니면 false */
  regular: boolean;
  /** 진행 중 · 완료 · 지난 기록 */
  status: string;
  page: string | null;
  startedAt: string | null;
  endedAt: string | null;
  issues: ReleaseIssue[];
  counts: ReleaseCounts;
};

export type ReleaseSummary = Omit<Release, "issues"> & { issueCount: number };

function read(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** `- **이름**: 값` 한 줄. fieldLine 은 값이 비면 다음 줄을 물어 오므로 줄 안에서만 읽는다. */
function lineField(md: string, label: string): string | null {
  const m = md.match(new RegExp(`^-[ \\t]*\\*\\*${label}\\*\\*[ \\t]*[:：][ \\t]*(.*)$`, "m"));
  return m?.[1].trim() || null;
}

function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function emptyCounts(): ReleaseCounts {
  return { total: 0, done: 0, pass: 0, fail: 0, hold: 0, skip: 0 };
}

function addCounts(a: ReleaseCounts, b: ReleaseCounts): ReleaseCounts {
  return {
    total: a.total + b.total,
    done: a.done + b.done,
    pass: a.pass + b.pass,
    fail: a.fail + b.fail,
    hold: a.hold + b.hold,
    skip: a.skip + b.skip,
  };
}

function countTcs(tcs: ReleaseTc[]): ReleaseCounts {
  const c = emptyCounts();
  for (const t of tcs) {
    c.total++;
    if (t.verdict === "pass") c.pass++;
    else if (t.verdict === "fail") c.fail++;
    else if (isHold(t)) c.hold++;
    else if (t.verdict === "skip") c.skip++;
  }
  c.done = c.pass + c.fail + c.hold + c.skip;
  return c;
}

function notDoneOf(md: string): string[] {
  const out: string[] = [];
  let inSection = false;
  for (const line of md.split("\n")) {
    if (/^##\s/.test(line)) {
      inSection = /stage 에서 하지 않은 시험/.test(line);
      continue;
    }
    const m = inSection && line.match(/^\s*-\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

type RunFile = { no: number; id: string; md: string };

/** 회차 폴더의 결과 md. dobby-test 와 같이 result 가 든 이름을 먼저 고른다. */
function runMd(dir: string): string | null {
  try {
    const mds = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"));
    const f = mds.find((x) => /result/i.test(x)) ?? mds[0];
    return f ? read(path.join(dir, f)) : null;
  } catch {
    return null;
  }
}

/** 같은 배포일에 회차가 여럿이면 검증 탭처럼 TC 번호로 묶어 마지막 판정을 쓴다. */
function mergeRuns(runs: RunFile[]): { tcs: ReleaseTc[]; notDone: string[] } {
  const byNum = new Map<string, ReleaseTc>();
  const notDone = new Set<string>();
  for (const r of runs) {
    for (const s of parseReport(r.md).scenarios) {
      const key = s.num.trim() || s.check.trim();
      if (!key) continue;
      const prev = byNum.get(key);
      byNum.set(key, { ...s, runs: [...(prev?.runs ?? []), r.no] });
    }
    for (const n of notDoneOf(r.md)) notDone.add(n);
  }
  return { tcs: [...byNum.values()], notDone: [...notDone] };
}

function orderStatus(key: string) {
  const md = read(path.join(getMetaDir(), key, "status.md"));
  return md ? parseOrderStatus(md, key) : null;
}

/** 오더 회차 폴더 목록(시각 순)과 그 번호. 번호는 검증 탭과 같게 1부터 센다. */
function orderRuns(key: string): { no: number; id: string; dir: string }[] {
  const root = path.join(getMetaDir(), key, "test-runs");
  try {
    return fs
      .readdirSync(root)
      .sort()
      .map((id, i) => ({ no: i + 1, id, dir: path.join(root, id) }))
      .filter((r) => fs.statSync(r.dir).isDirectory());
  } catch {
    return [];
  }
}

function buildIssue(
  base: Omit<ReleaseIssue, "runs" | "tcs" | "notDone" | "counts" | "title" | "hasOrder">,
  runs: RunFile[]
): ReleaseIssue {
  const { tcs, notDone } = mergeRuns(runs);
  const st = orderStatus(base.key);
  const title = st ? fieldLine(st.raw, "제목") : null;
  return {
    ...base,
    title,
    hasOrder: !!st,
    runs: runs.map((r) => ({ no: r.no, id: r.id })),
    tcs,
    notDone,
    counts: countTcs(tcs),
  };
}

/** 회차 칸의 경로(메타 기준 상대 경로)를 오더 회차 번호와 함께 읽는다. */
function runFromPath(rel: string): RunFile | null {
  const abs = path.join(getMetaDir(), rel);
  const md = runMd(abs);
  if (!md) return null;
  const m = rel.match(/^([^/]+)\/test-runs\/([^/]+)\/?$/);
  const id = path.basename(abs);
  const no = m ? (orderRuns(m[1]).find((r) => r.id === m[2])?.no ?? 0) : 0;
  return { no, id, md };
}

function fromFile(date: string): Release | null {
  const md = read(path.join(getMetaDir(), `RELEASE-${date}`, "stage.md"));
  if (!md) return null;
  const t = findTable(md, "이슈", "회차");
  const ci = t && {
    row: columnIndex(t.headers, "행"),
    key: columnIndex(t.headers, "이슈"),
    repo: columnIndex(t.headers, "저장소"),
    reflected: columnIndex(t.headers, "반영"),
    run: columnIndex(t.headers, "회차"),
    check: columnIndex(t.headers, "stage 칸"),
    note: columnIndex(t.headers, "비고"),
  };
  const cell = (r: string[], i: number) => {
    const v = (i >= 0 ? (r[i] ?? "") : "").replace(/^`|`$/g, "").trim();
    return v && v !== "-" ? v : null;
  };
  // 한 이슈가 저장소 둘이면 행이 둘이다. 이슈로 모은다.
  const grouped = new Map<string, { rows: string[][] }>();
  for (const r of t && ci ? t.rows : []) {
    const key = cell(r, ci!.key);
    if (!key) continue;
    grouped.set(key, { rows: [...(grouped.get(key)?.rows ?? []), r] });
  }
  const issues = [...grouped.entries()].map(([key, { rows }]) => {
    const first = rows[0];
    const paths = [...new Set(rows.flatMap((r) => (cell(r, ci!.run) ?? "").split(/\s*[·,]\s*/)).filter(Boolean))];
    const runs = paths.map(runFromPath).filter((x): x is RunFile => !!x);
    return buildIssue(
      {
        key,
        row: cell(first, ci!.row),
        repos: rows.map((r) => cell(r, ci!.repo)).filter((x): x is string => !!x),
        reflected: cell(first, ci!.reflected),
        stageCheck: cell(first, ci!.check),
        note: rows.map((r) => cell(r, ci!.note)).filter(Boolean).join(" · ") || null,
      },
      runs
    );
  });
  return finish(date, {
    status: lineField(md, "상태") ?? "진행 중",
    page: lineField(md, "릴리즈 노트"),
    startedAt: lineField(md, "시작"),
    endedAt: lineField(md, "끝"),
    issues,
  });
}

function finish(
  date: string,
  r: Pick<Release, "status" | "page" | "startedAt" | "endedAt" | "issues">
): Release {
  const weekday = weekdayOf(date);
  const issues = [...r.issues].sort((a, b) => Number(a.row ?? 999) - Number(b.row ?? 999));
  return {
    date,
    weekday,
    regular: weekday === "화" || weekday === "목",
    ...r,
    issues,
    counts: issues.reduce((c, i) => addCounts(c, i.counts), emptyCounts()),
  };
}

/**
 * 목록 파일이 없는 지난 기록 — 날짜 → 이슈 → 그날의 stage 회차.
 * 배포일은 상태 문서 `## 릴리즈 노트` 에 회차 날짜와 같은 배포일이 있으면 그것, 없으면 회차 날짜다.
 */
function historyByDate(): Map<string, Map<string, RunFile[]>> {
  const out = new Map<string, Map<string, RunFile[]>>();
  // 목록 파일에 이미 걸린 회차는 회차 날짜가 배포일과 달라도 그 배포일 것이다. 다시 세지 않는다.
  const linked = new Set(
    releaseDirs().flatMap((d) =>
      [...(read(path.join(getMetaDir(), `RELEASE-${d}`, "stage.md")) ?? "").matchAll(/[^\s|·,]+\/test-runs\/[^\s|·,/]+/g)].map((m) => m[0])
    )
  );
  let names: string[];
  try {
    names = fs.readdirSync(getMetaDir());
  } catch {
    return out;
  }
  for (const key of names) {
    if (!ORDER_KEY_RE.test(key)) continue;
    for (const r of orderRuns(key)) {
      const m = r.id.match(/^(\d{4})(\d{2})(\d{2})/);
      if (!m || linked.has(`${key}/test-runs/${r.id}`)) continue;
      const md = runMd(r.dir);
      if (!md || findEnv(md) !== "stage") continue;
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      const byKey = out.get(date) ?? new Map<string, RunFile[]>();
      byKey.set(key, [...(byKey.get(key) ?? []), { no: r.no, id: r.id, md }]);
      out.set(date, byKey);
    }
  }
  return out;
}

function fromHistory(date: string, byKey: Map<string, RunFile[]>, skip: Set<string>): ReleaseIssue[] {
  return [...byKey.entries()]
    .filter(([key]) => !skip.has(key))
    .map(([key, runs]) => {
      const st = orderStatus(key);
      const notes = (st?.releaseNote ?? []).filter((n) => n.date === date);
      const ship = (st?.ship ?? []).filter((s) => s.env === "stage");
      return buildIssue(
        {
          key,
          row: notes[0]?.row ?? null,
          repos: [
            ...new Set((notes.length ? notes : ship).map((x) => x.repo).filter((x): x is string => !!x)),
          ],
          reflected: "들어감",
          stageCheck: null,
          note: null,
        },
        runs
      );
    });
}

function releaseDirs(): string[] {
  try {
    return fs
      .readdirSync(getMetaDir())
      .map((n) => n.match(RELEASE_DIR_RE)?.[1])
      .filter((d): d is string => !!d);
  } catch {
    return [];
  }
}

function build(date: string, history: Map<string, Map<string, RunFile[]>>): Release | null {
  const file = fromFile(date);
  const extra = history.get(date);
  if (!file) {
    if (!extra) return null;
    return finish(date, { status: "지난 기록", page: null, startedAt: null, endedAt: null, issues: fromHistory(date, extra, new Set()) });
  }
  if (!extra) return file;
  // 목록 파일보다 먼저 돌린 같은 날 회차가 있으면 덧붙인다. 목록에 있는 이슈는 다시 넣지 않는다.
  const known = new Set(file.issues.map((i) => i.key));
  return finish(date, { ...file, issues: [...file.issues, ...fromHistory(date, extra, known)] });
}

export function listReleases(): ReleaseSummary[] {
  const history = historyByDate();
  const dates = new Set([...releaseDirs(), ...history.keys()]);
  return [...dates]
    .sort()
    .reverse()
    .map((d) => build(d, history))
    .filter((r): r is Release => !!r)
    .map(({ issues, ...rest }) => ({ ...rest, issueCount: issues.length }));
}

export function getRelease(date: string): Release | null {
  if (!RELEASE_DATE_RE.test(date)) return null;
  return build(date, historyByDate());
}

export function releaseCardStats(): CardStats {
  const list = listReleases();
  if (list.length === 0) return { overall: [{ label: "배포일", value: 0 }], today: [] };
  const p = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const t = list.find((r) => r.date === today);
  return {
    overall: [
      { label: "배포일", value: list.length },
      { label: "이슈", value: list.reduce((n, r) => n + r.issueCount, 0), color: "blue" },
      { label: "실패 남음", value: list.filter((r) => r.counts.fail > 0).length, color: "red" },
    ],
    today: t
      ? [
          { label: `/ ${t.counts.total} TC 처리`, value: t.counts.done, color: "green" },
          { label: "실패", value: t.counts.fail, color: t.counts.fail > 0 ? "red" : undefined },
        ]
      : [],
  };
}

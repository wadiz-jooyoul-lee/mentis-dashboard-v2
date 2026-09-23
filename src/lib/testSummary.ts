import fs from "node:fs";
import path from "node:path";
import { parseReport, type Verdict } from "@/lib/parseReport";

/**
 * 한 오더의 테스트 회차를 전부 모아 "무엇을 확인했고 어느 회차에서 봤나"로 다시 묶는다.
 *
 * 회차 하나만 보면 "1회차에서 무엇을 봤고 2회차에서 무엇이 달라졌나"를 알 수 없다.
 * 재실행한 회차는 대개 앞 회차의 일부만 다시 돌리므로, 항목별로 합쳐 봐야 전체가 보인다.
 *
 * ⛔ 결과를 파일로 남기지 않는다. 실측 1.1ms(오더 41개·회차 76개 전부 44ms)라 볼 때마다
 * 새로 세는 편이 싸고, 저장하면 회차가 늘 때마다 어긋난다.
 */

export type RunLine = {
  /** 폴더 이름(= 회차 id) */
  id: string;
  /** 1부터 — 시각 순 */
  no: number;
  label: string;
  /** dev·rc4 등. 못 찾으면 빈 문자열. */
  env: string;
  pass: number;
  fail: number;
  skip: number;
};

export type ItemLine = {
  /** 시나리오 번호(S1 등). 없으면 빈 문자열. */
  num: string;
  /** 확인 항목 이름 — 가장 최근 회차에 적힌 것 */
  name: string;
  /** 이 항목을 확인한 회차 번호들 */
  runs: number[];
  /** 가장 최근 회차의 판정 */
  verdict: Verdict;
  /** 회차마다 판정이 달랐으면 그 흐름(예 fail→pass). 같으면 null. */
  changed: Verdict[] | null;
  /** 보류·실패일 때 왜인지 — 최근 회차의 실제/근거 */
  note: string;
};

export type TestSummary = {
  runs: RunLine[];
  items: ItemLine[];
  /** 고유 항목 기준 집계 — 회차를 여러 번 돌아도 한 번만 센다. */
  pass: number;
  fail: number;
  skip: number;
  /** status.md 의 닫히는 조건(한 줄). 없으면 null. */
  closing: string | null;
};

/** `- **환경**: dev` 또는 `| 환경 | dev |` 어느 쪽으로 적혀 있어도 찾는다. */
function findEnv(md: string): string {
  const bullet = md.match(/^\s*-\s*\*\*(?:환경|실행 환경|테스트 환경)\*\*\s*[:：]\s*(.+)$/m);
  const table = md.match(/^\|\s*(?:환경|실행 환경|테스트 환경)\s*\|\s*([^|]+)\|/m);
  const raw = (bullet?.[1] ?? table?.[1] ?? "").trim();
  // `rc4 (https://rc4.wadiz.io)` · `dev, 크롬 데스크톱, 창 너비 1440` 처럼 뒤에 설명이 붙는다.
  // 앞의 환경 이름만 남긴다.
  const m = raw.match(/^([A-Za-z][A-Za-z0-9]*)\b/);
  return m ? m[1] : raw.slice(0, 12);
}

/** status.md 의 닫히는 조건 한 줄. */
function findClosing(dir: string): string | null {
  try {
    const md = fs.readFileSync(path.join(dir, "status.md"), "utf8");
    const m = md.match(/^\s*-\s*\*\*닫히는 조건\*\*\s*[:：]\s*(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

export function summarizeRuns(orderDir: string): TestSummary | null {
  const runsDir = path.join(orderDir, "test-runs");
  let entries: string[];
  try {
    entries = fs.readdirSync(runsDir).sort();
  } catch {
    return null;
  }

  const runs: RunLine[] = [];
  // 시나리오 번호 → 회차별 판정.
  // ⛔ 이름으로 묶으면 안 된다. 회차마다 같은 것을 다르게 적는다
  // (1회차 `홈 — 친구 활동 더보기` / 2회차 `/web/main`). 번호가 없을 때만 이름으로 묶는다.
  const seen = new Map<
    string,
    { num: string; name: string; runs: number[]; verdicts: Verdict[]; note: string }
  >();

  for (const id of entries) {
    const dir = path.join(runsDir, id);
    let file: string | undefined;
    try {
      const mds = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"));
      file = mds.find((f) => /result/i.test(f)) ?? mds[0];
    } catch {
      continue;
    }
    if (!file) continue;
    let md: string;
    try {
      md = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }

    const { scenarios, counts } = parseReport(md);
    const m = id.match(/(\d{4})-?(\d{2})-?(\d{2})[-_ ]?(\d{2}):?(\d{2})/);
    const no = runs.length + 1;
    runs.push({
      id,
      no,
      label: m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : id,
      env: findEnv(md),
      pass: counts.pass,
      fail: counts.fail,
      skip: counts.skip + counts.warn,
    });

    for (const s of scenarios) {
      const num = (s.num || "").trim();
      const name = (s.check || s.page || "").trim();
      const key = num || name;
      if (!key) continue;
      const cur = seen.get(key) ?? { num, name, runs: [], verdicts: [], note: "" };
      // 이름은 최근 회차 것으로 갱신한다(뒤 회차가 더 다듬어져 있는 편이다).
      if (name) cur.name = name;
      cur.runs.push(no);
      cur.verdicts.push(s.verdict);
      if (s.verdict === "fail" || s.verdict === "skip" || s.verdict === "warn") {
        cur.note = (s.actual || s.evidence || s.expected || "").trim();
      }
      seen.set(key, cur);
    }
  }

  if (runs.length === 0) return null;

  const items: ItemLine[] = [...seen.values()].map((v) => {
    const last = v.verdicts[v.verdicts.length - 1];
    const varied = new Set(v.verdicts).size > 1;
    return {
      num: v.num,
      name: v.name,
      runs: v.runs,
      verdict: last,
      changed: varied ? v.verdicts : null,
      note: v.note,
    };
  });

  return {
    runs,
    items,
    pass: items.filter((i) => i.verdict === "pass").length,
    fail: items.filter((i) => i.verdict === "fail").length,
    skip: items.filter((i) => i.verdict === "skip" || i.verdict === "warn").length,
    closing: findClosing(orderDir),
  };
}

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseReport,
  overallStatus,
  type Counts,
  type MetaItem,
} from "@/lib/parseReport";
import { parseStatus, type IssueStatus } from "@/lib/parseStatus";

/** 경로 문자열의 `~`·`$HOME`을 홈 디렉터리로 확장한다. */
function expandPath(v: string): string {
  let s = v.trim().replace(/\$\{?HOME\}?/g, os.homedir());
  if (s.startsWith("~")) s = path.join(os.homedir(), s.slice(1));
  return s;
}

/** work-dobby 설정 파일(~/.config/work-dobby/config.env)에서 변수 값을 읽는다. */
function readConfigEnv(name: string): string | undefined {
  try {
    const conf = path.join(os.homedir(), ".config", "work-dobby", "config.env");
    const txt = fs.readFileSync(conf, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(
        new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`)
      );
      if (m) return expandPath(m[1].replace(/^["']|["']$/g, ""));
    }
  } catch {
    /* 파일 없음 → undefined */
  }
  return undefined;
}

/** 설정 해석: 환경변수 → config.env → 기본값 순. */
function resolveConfig(envName: string, fallback: string): string {
  const fromEnv = process.env[envName];
  if (fromEnv && fromEnv.trim()) return expandPath(fromEnv);
  return readConfigEnv(envName) ?? fallback;
}

/** 작업 루트($DOBBY_WORKSPACE). 하위에 subtree/ 와 meta/ 가 있다. */
export function getWorkspaceDir(): string {
  return resolveConfig(
    "DOBBY_WORKSPACE",
    path.join(os.homedir(), "work", "dobby-workspace")
  );
}

/**
 * 메타 루트. .issue-start/.issue-test/.issue-end/.agent-start/.mentis-jobs 가 여기 있다.
 * DOBBY_META_PATH가 있으면 그 경로, 없으면 $DOBBY_WORKSPACE/meta (스킬 규약과 동일).
 * (DOBBY_META_DIR은 레거시 별칭으로 계속 인정)
 */
export function getMetaDir(): string {
  const explicit = process.env.DOBBY_META_PATH || process.env.DOBBY_META_DIR;
  if (explicit && explicit.trim()) return expandPath(explicit);
  const fromConf = readConfigEnv("DOBBY_META_PATH");
  if (fromConf) return fromConf;
  return path.join(getWorkspaceDir(), "meta");
}

/** 워크트리 루트($DOBBY_WORKSPACE/subtree). */
export function getSubtreeDir(): string {
  return path.join(getWorkspaceDir(), "subtree");
}

/** 원본 소스 저장소들이 있는 루트($DOBBY_REPOS_ROOT). */
export function getReposRoot(): string {
  return resolveConfig("DOBBY_REPOS_ROOT", path.join(os.homedir(), "work"));
}

/**
 * issue-test 스킬이 결과 md를 저장하는 루트 디렉터리.
 * 기본값: $DOBBY_WORKSPACE/meta/.issue-test
 * ISSUE_TEST_DIR 환경변수로 덮어쓸 수 있다.
 */
export function getIssueTestDir(): string {
  const fromEnv = process.env.ISSUE_TEST_DIR;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return path.join(getMetaDir(), ".issue-test");
}

export type IssueSummary = {
  /** 이슈 폴더명 (예: FE-10806) */
  key: string;
  /** 폴더 안(하위 포함)의 md 파일 개수 */
  reportCount: number;
  /** 가장 최근 md 파일의 수정 시각(ISO) */
  updatedAt: string | null;
  /** 최신 결과 미리보기 (파싱 실패/결과 없음이면 null) */
  preview: IssuePreview | null;
  /** status.md 기반 진행 상태 (없으면 null) */
  status: IssueStatus | null;
};

export type IssuePreview = {
  /** 종합 판정 라벨(통과/부분 통과/실패) */
  overallLabel: string;
  /** antd Tag color */
  overallColor: string;
  counts: Counts;
  /** 통과율(%) */
  passRate: number;
  /** 환경(RC2 등 짧은 코드) */
  env: string | null;
  /** 국내/글로벌 */
  scope: string | null;
  /** 테스트 일시(원문 문자열) */
  testedAt: string | null;
  /** 대상 브랜치 */
  branch: string | null;
};

/** 폴더 하위의 모든 .md 파일 경로를 재귀적으로 모은다. */
function findMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findMarkdownFiles(full));
    } else if (entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/** 파일명 우선순위: result 포함 > 일반 > plan(테스트 목록) */
function mdScore(file: string): number {
  const b = path.basename(file).toLowerCase();
  if (b.includes("result")) return 2;
  if (b.includes("plan")) return 0;
  return 1;
}

/** md 목록에서 대표(최신 결과) 파일을 고른다. */
function pickLatestMarkdown(mdFiles: string[]): string | null {
  if (mdFiles.length === 0) return null;
  const sorted = [...mdFiles].sort((a, b) => {
    const s = mdScore(b) - mdScore(a);
    if (s !== 0) return s;
    return fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime();
  });
  return sorted[0];
}

/** 메타에서 라벨 키워드로 값을 찾는다. */
function findMetaValue(meta: MetaItem[], ...keywords: string[]): string | null {
  for (const m of meta) {
    if (keywords.some((k) => m.label.includes(k))) return m.value;
  }
  return null;
}

function detectEnv(meta: MetaItem[]): string | null {
  const v = findMetaValue(meta, "환경");
  if (!v) return null;
  // "RC2 (...)" / "rc · 국내 · url" → 첫 토큰
  return v.split(/[\s(（·]/)[0].trim() || null;
}

function detectScope(meta: MetaItem[]): string | null {
  const explicit = findMetaValue(meta, "국내/글로벌", "지역");
  const src = explicit ?? findMetaValue(meta, "환경") ?? "";
  if (/둘\s*다|국내.*글로벌|글로벌.*국내/.test(src)) return "둘 다";
  if (/글로벌|global/i.test(src)) return "글로벌";
  if (/국내|korea|한국/i.test(src)) return "국내";
  return null;
}

function detectBranch(meta: MetaItem[]): string | null {
  const v = findMetaValue(meta, "브랜치", "대상");
  if (!v) return null;
  const backtick = v.match(/`([^`]+)`/);
  if (backtick) return backtick[1];
  return v.split(/[\s(（]/)[0].trim() || null;
}

function buildPreview(content: string): IssuePreview | null {
  const { meta, counts } = parseReport(content);
  if (counts.total === 0 && meta.length === 0) return null;
  const overall = overallStatus(counts);
  const passRate =
    counts.total > 0 ? Math.round((counts.pass / counts.total) * 100) : 0;
  return {
    overallLabel: overall.label,
    overallColor: overall.color,
    counts,
    passRate,
    env: detectEnv(meta),
    scope: detectScope(meta),
    testedAt: findMetaValue(meta, "일시"),
    branch: detectBranch(meta),
  };
}

/** 이슈 폴더의 status.md를 읽어 파싱한다. 없으면 null. */
export function getIssueStatus(key: string): IssueStatus | null {
  const statusPath = path.join(getIssueTestDir(), key, "status.md");
  if (!fs.existsSync(statusPath)) return null;
  try {
    return parseStatus(fs.readFileSync(statusPath, "utf8"));
  } catch {
    return null;
  }
}

/** .issue-test 하위의 이슈 폴더들을 나열한다. 폴더가 없으면 빈 배열. */
export function listIssues(): IssueSummary[] {
  const root = getIssueTestDir();
  if (!fs.existsSync(root)) return [];

  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  const issues: IssueSummary[] = dirs.map((dir) => {
    const dirPath = path.join(root, dir.name);
    const mdFiles = findMarkdownFiles(dirPath);

    let updatedAt: string | null = null;
    for (const f of mdFiles) {
      const mtime = fs.statSync(f).mtime;
      if (!updatedAt || mtime.toISOString() > updatedAt) {
        updatedAt = mtime.toISOString();
      }
    }

    const latest = pickLatestMarkdown(mdFiles);
    let preview: IssuePreview | null = null;
    if (latest) {
      try {
        preview = buildPreview(fs.readFileSync(latest, "utf8"));
      } catch {
        preview = null;
      }
    }

    return {
      key: dir.name,
      reportCount: mdFiles.length,
      updatedAt,
      preview,
      status: getIssueStatus(dir.name),
    };
  });

  // 최신 수정순 정렬
  issues.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return issues;
}

export type ReportRun = {
  /** 회차 식별자(시각 폴더명 또는 "legacy") */
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
 * 지원: 20260708-084455 / 2026-07-08_142338 / 2026-07-08-142338 등
 * (파싱 실패 시 null)
 */
function parseRunTimestamp(folder: string): { label: string; epoch: number } | null {
  const m = folder.match(
    /(\d{4})-?(\d{2})-?(\d{2})[-_ ]?(\d{2}):?(\d{2}):?(\d{2})/
  );
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

/**
 * 이슈의 모든 테스트 실행 결과(회차)를 최신순으로 읽는다.
 *  - 신 구조: {키}/results/{시각}/{키}-test-result.md → 시각 폴더별 1회차
 *  - 구 구조: {키}/{키}-test-result.md (루트) → "legacy" 1회차
 * 결과가 하나도 없으면 빈 배열.
 */
export function getReportRuns(key: string): ReportRun[] {
  const root = getIssueTestDir();
  const dirPath = path.join(root, key);
  if (!fs.existsSync(dirPath)) return [];

  const runs: ReportRun[] = [];

  // 신 구조: results/{시각}/*-test-result.md
  const resultsDir = path.join(dirPath, "results");
  if (fs.existsSync(resultsDir)) {
    for (const entry of fs.readdirSync(resultsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const runDir = path.join(resultsDir, entry.name);
      const mds = findMarkdownFiles(runDir);
      // result 포함 파일 우선(results.md, {키}-test-result.md 등), 없으면 첫 md
      const md =
        mds.find((f) => /result/i.test(path.basename(f))) ?? mds[0];
      if (!md) continue;
      const ts = parseRunTimestamp(entry.name);
      runs.push({
        id: entry.name,
        label: ts ? ts.label : entry.name,
        file: path.relative(root, md),
        content: fs.readFileSync(md, "utf8"),
        sortKey: ts ? ts.epoch : fs.statSync(md).mtime.getTime(),
      });
    }
  }

  // 구 구조: 루트 바로 아래 결과 md ({키}-test-result.md / results.md 등)
  const legacy = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && /result/i.test(e.name))
    .map((e) => path.join(dirPath, e.name));
  for (const md of legacy) {
    const mtime = fs.statSync(md).mtime;
    runs.push({
      id: "legacy",
      label: `${mtime.toLocaleString("ko-KR")} (기존)`,
      file: path.relative(root, md),
      content: fs.readFileSync(md, "utf8"),
      sortKey: mtime.getTime(),
    });
  }

  // 최신 우선
  runs.sort((a, b) => b.sortKey - a.sortKey);
  return runs;
}

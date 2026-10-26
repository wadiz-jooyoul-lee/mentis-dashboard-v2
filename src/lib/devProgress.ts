/**
 * 개발자 카드 진척도. 에이전트에게 기록을 더 시키지 않고(토큰 0) 이미 있는 파일과 git 만 읽는다.
 * 구현 중 = 설계 문서 "고칠 코드"의 파일 중 워크트리에서 바뀐 수 / 수정 중 = 최신 리뷰 지적 수.
 */
import fs from "node:fs";
import path from "node:path";
import { git, branchStart } from "@/lib/commitChanges";
import type { WorktreeRow } from "@/lib/parseOrderStatus";

export type DevProgress =
  | { mode: "impl"; done: number; total: number }
  | { mode: "fix"; findings: number };

const PENDING_RE = /^-\s*\*\*상태\*\*\s*[:：]\s*구현 대기/;

/** 설계 문서에서 이번에 고칠 파일 경로. `구현 대기` 인 변경 절이 있으면 그 절들의 고칠 코드만 본다. */
export function plannedFiles(designMd: string): { files: string[]; change: boolean } {
  const lines = designMd.split("\n");
  const ranges: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^##\s+변경\s/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && !/^##\s/.test(lines[end])) end++;
    if (!lines.slice(i + 1, Math.min(end, i + 8)).some((l) => PENDING_RE.test(l))) continue;
    const s = lines.findIndex((l, j) => j > i && j < end && /^###\s+고칠 코드/.test(l));
    if (s < 0) continue;
    let e = s + 1;
    while (e < end && !/^#{2,3}\s/.test(lines[e])) e++;
    ranges.push([s, e]);
  }
  const change = ranges.length > 0;
  if (!change) {
    const s = lines.findIndex((l) => /^##\s+고칠 코드/.test(l));
    if (s >= 0) {
      let e = s + 1;
      while (e < lines.length && !/^##\s/.test(lines[e])) e++;
      ranges.push([s, e]);
    }
  }
  const files = new Set<string>();
  for (const [s, e] of ranges) {
    for (const l of lines.slice(s + 1, e)) {
      if (!/^#{3,4}\s/.test(l)) continue;
      // 경로는 백틱 안에 있거나(`### 1. \`a/b.ts\``), 번호 뒤 첫 낱말로 바로 적힌다(`### a/b.ts (12행)`).
      const head = l.replace(/^#+\s+/, "").replace(/^[\d~-]+\.\s*/, "");
      const p = head.match(/`([^`\s]+)`/)?.[1] ?? head.split(/\s/)[0];
      if (p && /\/|\.\w+$/.test(p)) files.add(p);
    }
  }
  return { files: [...files], change };
}

/** 설계에 적힌 경로가 바뀐 파일 중 하나와 맞는가. 폴더(`/` 끝)는 그 아래 아무 파일, 이름만 적힌 것은 끝부분으로 맞춘다. */
function touched(planned: string, changed: string[]): boolean {
  if (planned.endsWith("/")) return changed.some((c) => c.startsWith(planned));
  if (planned.includes("/")) return changed.includes(planned);
  return changed.some((c) => c === planned || c.endsWith(`/${planned}`));
}

function changedFiles(wt: string, sinceHead: boolean): string[] {
  const base = sinceHead ? "HEAD" : branchStart(wt)?.sha;
  if (!base) return [];
  const diff = git(wt, ["diff", "--name-only", base]) ?? "";
  const extra = git(wt, ["ls-files", "--others", "--exclude-standard"]) ?? "";
  return [...diff.split("\n"), ...extra.split("\n")].filter(Boolean);
}

/** 개발자 세션 기록(agent-logs.json)의 마지막 하위 키. 넣은 순서대로 쌓이므로 마지막이 최근 세션이다. */
function lastSessionKey(dir: string, slug: string): string | null {
  try {
    const logs = JSON.parse(fs.readFileSync(path.join(dir, "agent-logs.json"), "utf8"));
    const v = logs?.[slug];
    if (!v || typeof v !== "object") return null;
    const keys = Object.keys(v);
    return keys[keys.length - 1] ?? null;
  } catch {
    return null;
  }
}

export function devProgress(
  dir: string,
  slug: string,
  designMd: string | null,
  worktrees: WorktreeRow[],
  reviews: { round: number; content: string }[]
): DevProgress | null {
  if (/^fix-/.test(lastSessionKey(dir, slug) ?? "")) {
    const last = Math.max(0, ...reviews.map((r) => r.round));
    const findings = reviews
      .filter((r) => r.round === last)
      .reduce((n, r) => n + (r.content.match(/^##\s*\[(blocker|major|minor|nit)\]/gim)?.length ?? 0), 0);
    return { mode: "fix", findings };
  }
  if (!designMd) return null;
  const { files, change } = plannedFiles(designMd);
  if (files.length === 0) return null;
  const changed = worktrees
    .filter((w) => w.path && fs.existsSync(w.path))
    .flatMap((w) => changedFiles(w.path, change));
  return { mode: "impl", done: files.filter((f) => touched(f, changed)).length, total: files.length };
}

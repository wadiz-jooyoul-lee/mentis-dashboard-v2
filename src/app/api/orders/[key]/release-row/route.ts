import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { ORDER_KEY_RE } from "@/lib/keys";
import { getMetaDir } from "@/lib/issues";
import { parseOrderStatus } from "@/lib/parseOrderStatus";
import { buildBundleReport } from "@/lib/bundleReport";
import { summarizeRuns } from "@/lib/testSummary";
import { jiraUrl } from "@/lib/jira";
import {
  kindOf,
  releaseRowHtml,
  releaseRowText,
  serviceCell,
  teamOf,
  type ReleaseRow,
} from "@/lib/releaseRow";

export const dynamic = "force-dynamic";

/**
 * 개발·검증 담당자.
 *
 * 1순위는 `jira-issue.md` 의 `- **담당자**: 이주열 / **보고자**: 임창훈`.
 * 다만 담당자 줄이 있는 파일은 69개 중 9개뿐이라 대개 비어 있다. 그래서 없으면
 * **이 대시보드를 쓰는 사람**(git user.name)으로 채운다 — 메타에 쌓인 오더는 전부
 * 그 사람이 돌린 것이다. 남의 이슈를 적을 일이 생기면 붙인 뒤 고치면 된다.
 */
function findOwner(dir: string): string {
  try {
    const md = fs.readFileSync(path.join(dir, "jira-issue.md"), "utf8");
    const m = md.match(/^\s*-\s*\*\*담당자\*\*\s*[:：]\s*([^/\n*]+)/m);
    if (m) return m[1].trim();
  } catch {
    /* git 쪽으로 */
  }
  return gitUserName();
}

/** git user.name. 한 번만 물어보고 들고 있는다(프로세스를 매번 띄울 값이 아니다). */
let cachedUser: string | null = null;
function gitUserName(): string {
  if (cachedUser !== null) return cachedUser;
  try {
    cachedUser = execFileSync("git", ["config", "user.name"], { encoding: "utf8" }).trim();
  } catch {
    cachedUser = "";
  }
  return cachedUser;
}

/**
 * Confluence 릴리즈 노트에 붙여넣을 한 줄을 서버에서 통째로 만들어 내려 준다.
 *
 * 왜 서버인가: 줄을 채우는 재료가 전부 서버에만 있다(번들 판정 git·grep, jira-issue.md 담당자,
 * status.md 브랜치, test-runs 환경·판정). 브라우저에서 모으면 API 를 네 번 부르게 된다.
 *
 * 버튼을 누른 순간 부른다. 번들 판정이 1.5초 걸려 화면 열 때마다 미리 만들면 안 쓰는 사람까지
 * 느려진다(번들 태그를 먼저 봤다면 캐시가 살아 있어 기다리지 않는다).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) {
    return NextResponse.json({ error: "잘못된 키" }, { status: 400 });
  }
  const dir = path.join(getMetaDir(), key);

  let branches: string[] = [];
  try {
    const md = fs.readFileSync(path.join(dir, "status.md"), "utf8");
    branches = parseOrderStatus(md, key)
      .worktrees.filter((w) => w.branch)
      .map((w) => `${w.repo}/${w.branch}`);
  } catch {
    branches = [];
  }

  const report = await buildBundleReport(key);
  const summary = summarizeRuns(dir);
  const last = summary?.runs[summary.runs.length - 1];

  const row: ReleaseRow = {
    service: serviceCell(report.impacts.map((i) => i.bundle)),
    kind: kindOf(branches),
    team: teamOf(key),
    issueKey: key,
    jiraUrl: jiraUrl(key),
    branches,
    owner: findOwner(dir),
    // `rc4` → `RC4`. 마지막 회차를 본 환경이다.
    env: (last?.env ?? "").toUpperCase(),
    // 실패가 하나라도 있으면 FAIL. 판정을 하나도 못 읽었으면 빈칸으로 둔다.
    verdict: summary ? (summary.fail > 0 ? "FAIL" : summary.pass > 0 ? "PASS" : "") : "",
  };

  return NextResponse.json({ row, html: releaseRowHtml(row), text: releaseRowText(row) });
}

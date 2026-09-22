import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { parseOrderStatus } from "@/lib/parseOrderStatus";
import { getDefaultBase, getMetaDir, getReposRoot, expandHome } from "@/lib/issues";
import { ORDER_KEY_RE } from "@/lib/keys";
import {
  ALL_BUNDLES,
  bundlesOf,
  changedFiles,
  type BundleImpact,
  type BundleReport,
} from "@/lib/bundles";

export const dynamic = "force-dynamic";

/**
 * 배포 번들 판정을 **화면과 분리해서** 내려 준다.
 *
 * 왜 API 로 빼는가: 판정에 git·grep 이 필요해 1.5초쯤 든다(실측: 사용 표 1.25초 + git log 1.39초).
 * 오더 상세의 모든 탭이 이걸 기다리면 탭마다 그만큼 느려진다. 태그는 부가 정보이므로 본문을
 * 먼저 그리고 결과가 오면 붙인다.
 *
 * 결과는 오더별로 메모리에 캐시한다. 커밋이 더 붙으면 바뀔 수 있어 오래 들고 있지 않는다.
 */
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; report: BundleReport }>();

/**
 * 저장소마다 **통합 브랜치 하나**만 고른다.
 *
 * 한 오더가 워크트리를 여러 개 쓰는 일이 흔하다(FE1-1830은 4개). 그런데 서브 브랜치
 * (`feature/FE1-1830-image-transform` 등)는 결국 통합 브랜치로 합쳐지므로, 넷을 다 합치면
 * **중간에 고쳤다가 되돌린 파일까지** 들어온다. 실제로 FE1-1830에서 studio 파일 2개가 그렇게
 * 켜져 파일 수가 124개에서 364개로 부풀었다.
 *
 * 브랜치명이 오더 키로 끝나는 것이 통합 브랜치다. 없으면 첫 줄을 쓴다.
 */
function pickIntegrationWorktrees(
  worktrees: { repo: string; path: string; branch?: string }[],
  key: string
): { repo: string; path: string }[] {
  const byRepo = new Map<string, { repo: string; path: string; branch?: string }[]>();
  for (const wt of worktrees) {
    if (!byRepo.has(wt.repo)) byRepo.set(wt.repo, []);
    byRepo.get(wt.repo)!.push(wt);
  }
  const picked: { repo: string; path: string }[] = [];
  for (const rows of byRepo.values()) {
    picked.push(rows.find((r) => (r.branch ?? "").endsWith(key)) ?? rows[0]);
  }
  return picked;
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) {
    return NextResponse.json({ error: "잘못된 키" }, { status: 400 });
  }

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.report);

  // 워크트리 경로만 필요하므로 status.md 만 읽는다(getEpic 은 로그·리뷰까지 훑어 비싸다).
  let worktrees: { repo: string; path: string }[] = [];
  try {
    const md = fs.readFileSync(path.join(getMetaDir(), key, "status.md"), "utf8");
    worktrees = parseOrderStatus(md, key).worktrees;
  } catch {
    worktrees = [];
  }

  // 저장소마다 따로 판정한다. 경로 규칙이 저장소별로 다르고, 한 오더가 프런트와 백엔드를
  // 같이 건드리는 일도 있다(app-api + wadiz-frontend).
  let fileCount = 0;
  const impacts: BundleImpact[] = [];
  for (const wt of pickIntegrationWorktrees(worktrees, key)) {
    // 워크트리가 정리됐으면(dobby-end) 원본 저장소에 커밋이 남아 있다.
    const candidates = [expandHome(wt.path), path.join(getReposRoot(), wt.repo)];
    const dir = candidates.find((d) => d && fs.existsSync(d));
    if (!dir) continue;
    const files = changedFiles(key, dir, getDefaultBase());
    if (files.length === 0) continue;
    fileCount += files.length;
    impacts.push(...(await bundlesOf(files, dir, wt.repo)));
  }

  const report: BundleReport = {
    fileCount,
    // 표시 순서를 고정한다(저장소를 도는 순서에 따라 태그가 뒤바뀌지 않게).
    impacts: impacts.sort((a, b) => ALL_BUNDLES.indexOf(a.bundle) - ALL_BUNDLES.indexOf(b.bundle)),
    unknown: fileCount === 0,
  };
  cache.set(key, { at: Date.now(), report });
  return NextResponse.json(report);
}

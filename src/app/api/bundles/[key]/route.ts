import { NextResponse } from "next/server";
import { ORDER_KEY_RE } from "@/lib/keys";
import { buildBundleReport } from "@/lib/bundleReport";

export const dynamic = "force-dynamic";

/**
 * 배포 번들 판정을 **화면과 분리해서** 내려 준다.
 *
 * 왜 API 로 빼는가: 판정에 git·grep 이 필요해 1.5초쯤 든다. 오더 상세의 모든 탭이 이걸
 * 기다리면 탭마다 그만큼 느려진다. 태그는 부가 정보이므로 본문을 먼저 그리고 결과가 오면 붙인다.
 * 판정 자체와 캐시는 `@/lib/bundleReport` 에 있다(릴리즈 노트 줄도 같은 것을 쓴다).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) {
    return NextResponse.json({ error: "잘못된 키" }, { status: 400 });
  }
  return NextResponse.json(await buildBundleReport(key));
}

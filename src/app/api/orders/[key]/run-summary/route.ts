import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ORDER_KEY_RE } from "@/lib/keys";
import { getMetaDir } from "@/lib/issues";

export const dynamic = "force-dynamic";

/**
 * 회차 폴더에 dobby-test 가 남긴 요약 화면(`summary.html`)을 그대로 돌려 준다.
 *
 * 테스트를 마칠 때 브라우저에 띄우는 그 화면이다. 예전에는 임시 폴더에 만들고 탭을 닫으면
 * 잃었는데, 이제 회차 폴더에 결과 파일과 같이 남긴다 — 나중에 "그때 뭐가 실패했더라"를
 * 다시 볼 수 있어야 한다.
 *
 * 브라우저는 `file://` 을 열어 주지 않으므로(보안) 대시보드가 대신 읽어 내려 준다.
 * 파일은 self-contained 라 바깥에서 받아오는 것이 없다.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const run = (req.nextUrl.searchParams.get("run") ?? "").trim();
  if (!ORDER_KEY_RE.test(key)) return new NextResponse("invalid key", { status: 400 });
  // 회차 id 는 폴더 이름이다. `..` 같은 것이 섞이면 메타 폴더 밖을 읽게 된다.
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(run) || run.includes("..")) {
    return new NextResponse("invalid run", { status: 400 });
  }

  const file = path.join(getMetaDir(), key, "test-runs", run, "summary.html");
  let html: string;
  try {
    html = fs.readFileSync(file, "utf8");
  } catch {
    return new NextResponse("이 회차에는 요약 화면이 없습니다.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { exposureOn, isLocalHost } from "@/lib/lanToggle";

/**
 * 외부(다른 기기) 접근 문지기.
 *
 * Next 16에서 `middleware`는 `proxy`로 이름이 바뀌었고 **기본이 Node.js 런타임**이라
 * 파일을 읽을 수 있다(Next 14의 edge 런타임에서는 불가능했다). 덕분에 토글 파일을 보고
 * 재기동 없이 공개를 켜고 끌 수 있다.
 *
 * ⚠️ 접속자의 실제 IP는 Next 15에서 제거되어(`NextRequest.ip`) 쓸 수 없다. 그래서
 * "이 맥에서 온 요청"인지는 **Host 헤더**로만 판단한다 — 위조 가능하므로 사내망 개발용 전제.
 *
 * matcher를 두지 않아 **정적 파일(_next/static)·이미지까지 모든 요청**이 이 검사를 거친다.
 * 페이지만 막고 자산을 열어 두면 차단이 의미가 없기 때문이다.
 */
export function proxy(request: NextRequest) {
  if (isLocalHost(request.headers.get("host"))) return NextResponse.next();
  if (exposureOn()) return NextResponse.next();
  return new NextResponse(
    "이 대시보드는 지금 외부 공개가 꺼져 있습니다.\n소유자가 대시보드 헤더의 '외부 공개'를 켜면 접속할 수 있습니다.\n",
    { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

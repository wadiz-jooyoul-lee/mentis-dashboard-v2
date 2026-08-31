import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { exposureOn, isSelfRequest } from "@/lib/lanToggle";

/**
 * 외부(다른 기기) 접근 문지기. Next 16의 proxy는 Node.js 런타임이라 토글 파일을
 * 읽을 수 있어, 재기동 없이 켜고 끈다.
 *
 * 판정 순서:
 *   1. 이 맥 자신의 요청(localhost 또는 출발지 IP = 내 IP) → 전부 통과.
 *      (Host만 보면 소유자가 .local 주소로 열었을 때 외부로 오판 — isSelfRequest 참조)
 *   2. 외부인데 공개 꺼짐 → 403.
 *   3. 외부 + 공개 켜짐(정책 C) → 화면(페이지)은 열고 /api/* 는 차단하되,
 *      공유 목적물인 아티팩트 HTML 하나만 예외로 연다.
 *      콘솔(Claude 세션 대화 기록)·세션 정보·잡 목록이 전부 /api/orders 뒤에 있어
 *      "기본 차단 + 예외 나열"로 묶는다 — 새 API가 생겨도 기본이 닫힘이다.
 *
 * matcher를 두지 않아 정적 파일·이미지까지 모든 요청이 이 검사를 거친다.
 * ⚠️ 접속자 실제 IP는 Next 15에서 제거되어(NextRequest.ip) 헤더 기반이며 위조 가능
 * (사내망 개발용 전제).
 */
const EXTERNAL_API_ALLOW = new Set(["/api/orders/artifact-html"]);

export function proxy(request: NextRequest) {
  if (isSelfRequest(request)) return NextResponse.next();
  if (!exposureOn()) {
    return new NextResponse(
      "이 대시보드는 지금 외부 공개가 꺼져 있습니다.\n소유자가 대시보드 헤더의 '외부 공개'를 켜면 접속할 수 있습니다.\n",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const p = request.nextUrl.pathname;
  if (p.startsWith("/api/") && !EXTERNAL_API_ALLOW.has(p)) {
    return NextResponse.json(
      { ok: false, error: "외부에서는 조회할 수 없는 내부 데이터입니다." },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

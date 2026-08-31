import { NextResponse } from "next/server";
import { isSelfRequest } from "@/lib/lanToggle";

/**
 * 실행·변경 API 공통 가드. 핸들러 **첫 줄**에서 호출한다 — 본문 분기마다 넣으면
 * 새 분기를 추가할 때 빠뜨리므로, 함수 입구에서 한 번에 막는다.
 * (버튼 숨김은 UX일 뿐이고, 실제 방어는 이 가드다.)
 */
export function denyRemote(req: Request): NextResponse | null {
  if (isSelfRequest(req)) return null;
  return NextResponse.json(
    { ok: false, error: "이 대시보드가 실행 중인 맥에서만 실행할 수 있습니다." },
    { status: 403 },
  );
}

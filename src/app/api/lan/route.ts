import { NextResponse } from "next/server";
import { exposureOn, setExposure, isLocalHost } from "@/lib/lanToggle";
import { lanHostname, lanIpv4 } from "@/lib/lanHost";

export const dynamic = "force-dynamic";

/** 켜졌을 때 다른 기기가 쓸 주소. 숫자 IP 노출을 피해 mDNS 이름을 먼저 쓴다. */
function shareHost(): string | null {
  return lanHostname() ?? lanIpv4();
}

/** 현재 공개 상태와, 요청자가 이 맥인지(= 토글을 바꿀 수 있는지)를 돌려준다. */
export async function GET(req: Request) {
  return NextResponse.json({
    on: exposureOn(),
    canToggle: isLocalHost(req.headers.get("host")),
    host: shareHost(),
  });
}

/**
 * 공개를 켜고 끈다. **이 맥에서 온 요청만** 허용한다.
 * 공개 중일 때는 다른 기기도 이 API에 닿을 수 있어, 남이 마음대로 켜고 끄는 것을 막아야 한다.
 */
export async function POST(req: Request) {
  if (!isLocalHost(req.headers.get("host"))) {
    return NextResponse.json({ error: "이 맥에서만 바꿀 수 있습니다." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.on !== "boolean") {
    return NextResponse.json({ error: "on(true/false)이 필요합니다." }, { status: 400 });
  }
  setExposure(body.on);
  return NextResponse.json({ on: exposureOn(), canToggle: true, host: shareHost() });
}

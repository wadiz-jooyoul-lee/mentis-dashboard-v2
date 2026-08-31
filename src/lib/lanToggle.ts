import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * 외부(다른 기기) 공개 여부 토글.
 *
 * 서버는 항상 0.0.0.0에 열려 있고, 실제 차단은 `src/proxy.ts`가 이 값을 보고 한다.
 * 그래서 재기동 없이 즉시 켜고 끌 수 있다. 값은 파일 한 줄("on"/"off")로만 보관한다 —
 * 프록시와 API 라우트는 서로 다른 실행 문맥이라 메모리 변수를 공유할 수 없기 때문이다.
 *
 * ⚠️ 이 방식은 포트 자체는 계속 열어 둔 채 앱이 막는 구조다. 운영체제가 연결을 거부하는
 * 127.0.0.1 바인드보다 약하며, Host 헤더를 위조하면 우회될 수 있다(사내망 개발용 전제).
 */
const FILE = path.join(process.cwd(), ".lan-exposure");

/** 이 맥 자신을 가리키는 이름들. 여기로 온 요청은 토글과 무관하게 늘 통과시킨다(잠금 방지). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** 파일이 바뀐 순간만 다시 읽는다(정적 파일까지 매 요청 프록시를 타므로 읽기 비용을 줄임). */
let cache: { at: number; on: boolean } = { at: -1, on: false };

/** 지금 외부 공개가 켜져 있는가. 파일이 없으면 꺼짐(안전한 기본값). */
export function exposureOn(): boolean {
  let mtime: number;
  try {
    mtime = fs.statSync(FILE).mtimeMs;
  } catch {
    cache = { at: -1, on: false };
    return false;
  }
  if (mtime !== cache.at) {
    let on = false;
    try {
      on = fs.readFileSync(FILE, "utf8").trim() === "on";
    } catch {
      on = false;
    }
    cache = { at: mtime, on };
  }
  return cache.on;
}

/** 토글을 바꾼다. 다음 요청부터 즉시 반영된다. */
export function setExposure(on: boolean): void {
  fs.writeFileSync(FILE, on ? "on\n" : "off\n");
  cache = { at: -1, on };
}

/**
 * Host 헤더가 이 맥 자신인가. 포트는 떼고 본다.
 * IPv6는 `[::1]:7253`처럼 대괄호로 오므로 대괄호까지를 이름으로 본다.
 */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.replace(/:\d+$/, "");
  return LOCAL_HOSTS.has(name.toLowerCase());
}

/** 이 맥이 가진 모든 IP(자기 자신에게 접속할 때 나올 수 있는 출발지 주소). 10초 캐시. */
let ownCache: { at: number; set: Set<string> } = { at: 0, set: new Set() };
function ownAddresses(): Set<string> {
  const now = Date.now();
  if (now - ownCache.at < 10_000 && ownCache.set.size > 0) return ownCache.set;
  const set = new Set<string>(["127.0.0.1", "::1"]);
  for (const list of Object.values(os.networkInterfaces()))
    for (const ni of list ?? []) set.add(ni.address);
  ownCache = { at: now, set };
  return set;
}

/**
 * 이 요청이 **이 맥 자신에게서** 왔는가 — localhost·MARO-LT1628.local·IP 어느 이름으로 열었든.
 *
 * Host 헤더만 보면 소유자가 자기 맥에서 .local 주소로 열었을 때 외부로 오판한다. 그래서
 * 접속 출발지 IP를 함께 본다: Next가 소켓의 상대 주소를 `x-forwarded-for`에 채워 주므로
 * (next/dist/server/base-server.js — 헤더가 없을 때만 채움), 그 값이 이 맥의 IP면 자신이다.
 * ⚠️ 헤더를 직접 실어 보내면 위조 가능하다 — 기존 Host 위조와 같은 등급(사내망 개발용 전제).
 */
export function isSelfRequest(req: { headers: { get(name: string): string | null } }): boolean {
  if (isLocalHost(req.headers.get("host"))) return true;
  const peer = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")[0]
    .trim()
    .replace(/^::ffff:/, ""); // IPv4-mapped IPv6 정규화
  return peer !== "" && ownAddresses().has(peer);
}

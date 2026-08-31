import os from "node:os";
import { spawnSync } from "node:child_process";

/** VPN·터널·가상 인터페이스(타 기기가 접근 못 하는 IP)는 건너뛴다. */
const TUNNEL_IFACE = /^(utun|tun|tap|ppp|wg|ipsec|awdl|llw|bridge)/i;

/**
 * 첫 번째 비내부(non-internal) IPv4 LAN 주소. 없으면 null.
 * 아티팩트 링크를 localhost 대신 다른 기기에서도 열 수 있는 IP로 노출할 때 쓴다(서버 전용).
 * VPN/터널 인터페이스는 제외하고, 없으면 마지막 후보로 폴백한다.
 */
export function lanIpv4(): string | null {
  const ifaces = os.networkInterfaces();
  let fallback: string | null = null;
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      if (!TUNNEL_IFACE.test(name)) return ni.address; // 실 LAN 인터페이스 우선
      fallback ??= ni.address; // 터널뿐이면 그거라도
    }
  }
  return fallback;
}

/**
 * 다른 기기에서도 열리는 **호스트 이름**(mDNS). 없으면 null.
 *
 * 아티팩트 링크에 LAN IP(예: 192.168.10.67)를 그대로 노출하면, 그 링크가 Jira·Slack·공개
 * 아티팩트로 새어 나갈 때 내부망 대역이 함께 드러난다(사설 IP라 접속은 불가하지만 불필요한 노출).
 * macOS는 `LocalHostName`.local로 같은 네트워크에서 접근되므로 숫자 대신 이름을 쓴다.
 *
 * ⚠️ `os.hostname()`은 VPN·DHCP 환경에서 엉뚱한 이름(예: ip-10-200-8-39.…compute.internal)을
 * 돌려주므로 쓰지 않는다. mDNS가 막힌 망에서는 다른 기기에서 안 열리므로 **호출부가 IP로 폴백**해야 한다.
 */
export function lanHostname(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const r = spawnSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8", timeout: 2000 });
    const name = (r.stdout ?? "").trim();
    return /^[A-Za-z0-9-]+$/.test(name) ? `${name}.local` : null;
  } catch {
    return null;
  }
}

/**
 * 이 서버가 실제로 어느 주소에 바인드돼 있는지 = **다른 기기에 공개 중인지**.
 *   "local"   127.0.0.1 — 이 맥에서만 열림
 *   "lan"     0.0.0.0/* — 같은 네트워크의 다른 기기에서도 열림
 *   "unknown" 판정 실패(lsof 없음 등)
 *
 * 바인드 주소는 기동 옵션(-H)으로 정해져 실행 중에는 바꿀 수 없다. 화면에는 "지금 열려 있는지"만
 * 보여 주고, 바꾸려면 `npm run lan on|off`(재기동)를 안내한다.
 */
export function listenExposure(): "local" | "lan" | "unknown" {
  try {
    const r = spawnSync("lsof", ["-nP", "-a", "-p", String(process.pid), "-iTCP", "-sTCP:LISTEN"], {
      encoding: "utf8",
      timeout: 2000,
    });
    const lines = (r.stdout ?? "").split("\n").slice(1).filter(Boolean);
    if (lines.length === 0) return "unknown";
    for (const l of lines) {
      const addr = (l.split(/\s+/)[8] ?? "").split(":")[0];
      if (addr === "*" || addr === "0.0.0.0") return "lan";
    }
    return "local";
  } catch {
    return "unknown";
  }
}

import os from "node:os";

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

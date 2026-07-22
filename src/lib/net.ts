/** 서버(이 대시보드가 도는 머신)의 LAN IPv4 주소. 공유 가능한 링크 생성용(localhost 대신). */
import os from "node:os";

export function getLanIp(): string | null {
  const cands: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      // Node 18+는 family가 "IPv4" 문자열, 구버전은 숫자 4.
      const isV4 = ni.family === "IPv4" || (ni.family as unknown as number) === 4;
      if (isV4 && !ni.internal) cands.push(ni.address);
    }
  }
  // 사설망 우선: 192.168.x → 10.x → 172.16~31.x, 없으면 첫 후보.
  return (
    cands.find((a) => a.startsWith("192.168.")) ??
    cands.find((a) => a.startsWith("10.")) ??
    cands.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) ??
    cands[0] ??
    null
  );
}

/** 도비 스킨색 유틸(오케스트레이션 보드·에이전트 소개에서 공용). */

/** 이름 → 0~359 색상(hue). */
export function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** HSL → 헥스. h:0~360, s·l:0~100. */
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * 에이전트 이름 → 도비 스킨색. 이름 앞 토큰만 해시해 칸반·리뷰·소개에서 동일 색 유지
 * ("어드민" ↔ "어드민 에이전트"). 명도 62·채도 46으로 고정해 너무 어둡/밝지 않게.
 */
export function dobbyColor(name: string): string {
  const key = (name || "").trim().split(/\s+/)[0] || "agent";
  return hslToHex(hashHue(key), 46, 62);
}

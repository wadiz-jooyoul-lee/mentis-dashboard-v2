// BTS 멤버 에이전트용 실사진 아바타 설정. 작업 상태에 따라 5표정 사진을 스왑한다.
// 졸림·생각·집중·호기심·기쁨 → 대기·분석·구현·리뷰·완료. 사진은 로컬 전용(public/avatars/bts/).

export type BtsExpr = "sleepy" | "think" | "focus" | "curious" | "happy";

export type BtsCfg = { slug: string; color: string };

// 멤버 → 파일명 접두어(ascii) + 시그니처 색(링·태그 공용). 색은 기존 SVG 아바타 값을 유지.
export const BTS_AVATARS: Record<string, BtsCfg> = {
  RM: { slug: "rm", color: "#5C6BC0" },
  진: { slug: "jin", color: "#F48FB1" },
  슈가: { slug: "suga", color: "#26A69A" },
  제이홉: { slug: "jhope", color: "#FB8C00" },
  지민: { slug: "jimin", color: "#F9A825" },
  뷔: { slug: "v", color: "#5C8DEF" },
  정국: { slug: "jungkook", color: "#7E57C2" },
};

export function btsColor(member: string): string | null {
  return BTS_AVATARS[member]?.color ?? null;
}

/** 에이전트 상태 → 표정 사진. 5상태를 5표정에 대응(미지정·그 외는 생각). */
export function btsExpr(state?: string): BtsExpr {
  const s = (state ?? "").replace(/\s/g, "");
  if (/완료|해결|종료/.test(s)) return "happy";
  if (/리뷰/.test(s)) return "curious";
  if (/구현|산출|수정/.test(s)) return "focus";
  if (/분석/.test(s)) return "think";
  if (/대기/.test(s)) return "sleepy";
  return "think";
}

export function btsSrc(slug: string, expr: BtsExpr): string {
  return `/avatars/bts/${slug}-${expr}.jpeg`;
}

/** 원형 크롭 초점(object-position). 사진을 머리 중심의 정사각으로 잘라 두어 전부 중앙(50% 50%)이면 된다. */
export const BTS_FOCAL: Record<BtsExpr, string> = {
  sleepy: "50% 50%",
  think: "50% 50%",
  focus: "50% 50%",
  curious: "50% 50%",
  happy: "50% 50%",
};

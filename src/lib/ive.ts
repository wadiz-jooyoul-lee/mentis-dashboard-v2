/**
 * IVE(아이브) 멤버 아바타 정본. 다른 그룹(BTS·프로미스)이 오리지널 SVG인 것과 달리,
 * IVE는 웹에서 수집해 본인·표정을 육안 검증한 실사진을 원형으로 크롭해 쓴다(로컬 전용).
 * 사진은 `public/avatars/ive/{slug}{,-smile,-surprise}.jpeg`, 표정별 focal(object-position)로 얼굴을 맞춘다.
 * 멤버 키는 한국어 이름(BTS·프로미스와 동일 규약) — avatarAssign 풀·소개 카드·GroupAvatar가 이 키로 참조한다.
 */
export type IveExpr = "base" | "smile" | "surprise";

export type IveCfg = {
  slug: string; // 파일명 접두어(ascii)
  color: string; // 시그니처 색(링·카드 태그 공용)
  real: string;
  birth: string;
  pos: string;
  focal: Record<IveExpr, string>; // 표정별 얼굴 초점(object-position)
};

export const IVE_AVATARS: Record<string, IveCfg> = {
  가을: { slug: "gaeul", color: "#E8703A", real: "김가을", birth: "2002-09-24", pos: "메인댄서·리드래퍼",
    focal: { base: "50% 16%", smile: "50% 30%", surprise: "50% 34%" } },
  안유진: { slug: "yujin", color: "#8E5BE8", real: "안유진", birth: "2003-09-01", pos: "리더·메인보컬",
    focal: { base: "46% 20%", smile: "52% 22%", surprise: "50% 18%" } },
  레이: { slug: "rei", color: "#3AA0E8", real: "나오이 레이", birth: "2004-02-03", pos: "메인래퍼",
    focal: { base: "50% 18%", smile: "50% 30%", surprise: "52% 28%" } },
  장원영: { slug: "wonyoung", color: "#E94F8A", real: "장원영", birth: "2004-08-31", pos: "비주얼·센터",
    focal: { base: "51% 18%", smile: "50% 24%", surprise: "44% 18%" } },
  리즈: { slug: "liz", color: "#F2B01E", real: "김지원", birth: "2004-11-21", pos: "메인보컬",
    focal: { base: "50% 16%", smile: "55% 20%", surprise: "62% 34%" } },
  이서: { slug: "leeseo", color: "#2FC4A6", real: "이현서", birth: "2007-02-21", pos: "리드댄서·막내",
    focal: { base: "53% 18%", smile: "48% 26%", surprise: "56% 38%" } },
};

/** 멤버 → 시그니처 색(없으면 null). */
export function iveColor(member: string): string | null {
  return IVE_AVATARS[member]?.color ?? null;
}

/**
 * 에이전트 상태 → 표정 사진. 완료=활짝(smile), 수정(헐레벌떡)=놀람(surprise), 그 외=기본(base).
 * BTS·프로미스의 stateFace와 같은 취지(상태로 표정 오버라이드)를 사진 스왑으로 옮긴 것.
 */
export function iveExpr(state?: string): IveExpr {
  const s = (state ?? "").replace(/\s/g, "");
  if (/완료/.test(s)) return "smile";
  if (/수정/.test(s)) return "surprise";
  return "base";
}

/** 표정별 사진 경로(public 기준). base는 접미사 없음. */
export function iveSrc(slug: string, expr: IveExpr): string {
  return `/avatars/ive/${slug}${expr === "base" ? "" : `-${expr}`}.jpeg`;
}

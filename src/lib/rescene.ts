/**
 * RESCENE(리센느) 멤버 아바타 정본. IVE와 같은 실사진 방식 —
 * 웹에서 수집해 본인·표정을 육안 검증한 뉴스 포토를 얼굴 중심 정사각으로
 * 크롭해 쓴다(512px 경량화, 로컬 전용). 출처는 public/avatars/rescene/SOURCES.md.
 * 사진이 머리 중심 정사각이라 focal 없이 중앙(50% 50%)이면 된다(BTS 규약).
 * 멤버 키는 한국어 이름(다른 그룹과 동일 규약) — avatarAssign 풀·소개 카드·GroupAvatar가 이 키로 참조한다.
 *
 * 그룹: 2024-03-26 데뷔, 더뮤즈엔터테인먼트, 5인조 다국적(한국 4·일본 1).
 */
export type ResceneExpr = "base" | "think" | "smile" | "curious" | "cheer";

export type ResceneCfg = {
  slug: string; // 파일명 접두어(ascii)
  color: string; // 시그니처 색(링·카드 태그 공용)
  real: string;
  birth: string;
  nation: string;
  pos: string;
};

export const RESCENE_AVATARS: Record<string, ResceneCfg> = {
  원이: { slug: "woni", color: "#9B59D0", real: "정원이", birth: "2004-05-25", nation: "대한민국", pos: "리더" },
  리브: { slug: "liv", color: "#4DB6AC", real: "진경은", birth: "2006-10-11", nation: "대한민국", pos: "보컬" },
  미나미: { slug: "minami", color: "#F06292", real: "이토 미나미", birth: "2006-11-29", nation: "일본", pos: "메인보컬·메인댄서" },
  메이: { slug: "may", color: "#FFB300", real: "이예빈", birth: "2008-08-19", nation: "대한민국", pos: "보컬(킬링파트)" },
  제나: { slug: "zena", color: "#FF7043", real: "김가영", birth: "2008-11-27", nation: "대한민국", pos: "보컬·막내" },
};

/** 멤버 → 시그니처 색(없으면 null). */
export function resceneColor(member: string): string | null {
  return RESCENE_AVATARS[member]?.color ?? null;
}

/**
 * 에이전트 상태 → 표정 사진. BTS처럼 5상태 전부 다른 표정:
 * 대기=기본(base), 분석=생각(think), 구현·수정=미소(smile: 신나게 작업),
 * 리뷰=호기심(curious), 완료=세리머니(cheer: 하트·손인사).
 */
export function resceneExpr(state?: string): ResceneExpr {
  const s = (state ?? "").replace(/\s/g, "");
  if (/완료|해결|종료/.test(s)) return "cheer";
  if (/리뷰/.test(s)) return "curious";
  if (/구현|산출|수정/.test(s)) return "smile";
  if (/분석/.test(s)) return "think";
  return "base";
}

/** 표정별 사진 경로(public 기준). base는 접미사 없음. */
export function resceneSrc(slug: string, expr: ResceneExpr): string {
  return `/avatars/rescene/${slug}${expr === "base" ? "" : `-${expr}`}.jpeg`;
}

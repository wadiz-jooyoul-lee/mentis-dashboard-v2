// RESCENE(리센느) 멤버 에이전트용 실사진 아바타. 원형 크롭 + 시그니처 색 링, 작업 상태에 따라
// base/think/smile/curious/cheer 5표정 사진을 스왑한다(BTS와 같은 5상태 전대응).
// 사진은 얼굴 중심 정사각(로컬 전용, public/avatars/rescene/)이라 초점은 항상 중앙이다.
// 알 수 없는 멤버면 null(호출부에서 폴백).

import { RESCENE_AVATARS, resceneExpr, resceneSrc } from "@/lib/rescene";

export { RESCENE_AVATARS };

export default function ResceneAvatar({
  member,
  size = 56,
  state,
}: {
  member: string;
  size?: number;
  /** 있으면 상태에 맞는 표정 사진으로 스왑(분석→think·구현→smile·리뷰→curious·완료→cheer). 없으면 base. */
  state?: string;
}) {
  const cfg = RESCENE_AVATARS[member];
  if (!cfg) return null;
  const expr = resceneExpr(state);
  const ring = Math.max(2, Math.round(size * 0.05));
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        padding: ring,
        background: cfg.color,
        flexShrink: 0,
        lineHeight: 0,
      }}
      aria-label={`${member} 아바타`}
      role="img"
    >
      <img
        src={resceneSrc(cfg.slug, expr)}
        alt={`${member} ${expr}`}
        width={size - ring * 2}
        height={size - ring * 2}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          objectFit: "cover",
          objectPosition: "50% 50%",
          border: "2px solid rgba(255,255,255,0.85)",
          display: "block",
        }}
      />
    </span>
  );
}

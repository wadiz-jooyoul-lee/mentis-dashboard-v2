// fromis_9(프로미스나인) 멤버 에이전트용 오리지널 SVG 아바타. 실제 사진 미사용.
// 걸그룹 특성상 긴머리 표현을 위해 뒷머리(얼굴 뒤)+앞머리(얼굴 앞) 2레이어로 그린다.
// svg-avatar 스킬의 레이어/정수리/구분 규칙을 따른다.

import { stateFace } from "@/lib/avatarExpression";

type Eyes = "calm" | "bright" | "sleepy" | "happy" | "soft" | "droopy" | "round";
type Mouth = "neutral" | "smile" | "flat" | "bigSmile" | "softSmile" | "gentle" | "grin" | "gasp";
type Style = "longStraight" | "longWavy" | "bangsLong" | "ponytail" | "bob";
type Face = "oval" | "round" | "long" | "angular" | "heart" | "slim" | "diamond";

type Cfg = { color: string; hairColor: string; face: Face; style: Style; eyes: Eyes; mouth: Mouth };

export const FROMIS_AVATARS: Record<string, Cfg> = {
  송하영: { color: "#E85A9B", hairColor: "#5B3A25", face: "oval", style: "longStraight", eyes: "bright", mouth: "smile" },
  박지원: { color: "#7C4DFF", hairColor: "#2E2A2E", face: "round", style: "longWavy", eyes: "soft", mouth: "softSmile" },
  이채영: { color: "#FF7043", hairColor: "#7A3A2A", face: "heart", style: "bangsLong", eyes: "happy", mouth: "grin" },
  이나경: { color: "#26C6DA", hairColor: "#8A5A2E", face: "diamond", style: "ponytail", eyes: "calm", mouth: "gentle" },
  백지헌: { color: "#F9A825", hairColor: "#241F26", face: "slim", style: "bob", eyes: "round", mouth: "bigSmile" },
};

export function fromisColor(member: string): string | null {
  return FROMIS_AVATARS[member]?.color ?? null;
}

const SKIN = "#F8D6B4";
const SKIN_SHADE = "#EABF95";
const BLUSH = "#F2A9A0";

function shade(hex: string, f: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const mix = (ch: number) => cl(ch * (f < 0 ? 1 + f : 1) + (f > 0 ? 255 * f : 0));
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

const FACES: Record<Face, { d: string; ex: number }> = {
  oval: { d: "M50,15 C63,15 73,26 73,40 C73,54 63,66 50,66 C37,66 27,54 27,40 C27,26 37,15 50,15 Z", ex: 27 },
  round: { d: "M50,16 C65,16 75,28 75,41 C75,55 64,64 50,64 C36,64 25,55 25,41 C25,28 35,16 50,16 Z", ex: 25 },
  long: { d: "M50,14 C61,14 69,25 69,39 C69,57 60,71 50,71 C40,71 31,57 31,39 C31,25 39,14 50,14 Z", ex: 30 },
  angular: { d: "M50,15 C63,15 71,24 72,37 L72,46 C72,58 62,67 50,67 C38,67 28,58 28,46 L28,37 C29,24 37,15 50,15 Z", ex: 27 },
  heart: { d: "M50,15 C65,15 75,27 74,40 C73,52 60,68 50,68 C40,68 27,52 26,40 C25,27 35,15 50,15 Z", ex: 26 },
  slim: { d: "M50,16 C60,16 67,27 67,40 C67,54 59,65 50,65 C41,65 33,54 33,40 C33,27 40,16 50,16 Z", ex: 32 },
  diamond: { d: "M50,15 C58,15 66,21 70,33 C73,45 60,68 50,68 C40,68 27,45 30,33 C34,21 42,15 50,15 Z", ex: 30 },
};

// 뒷머리(얼굴 뒤, 긴 기장). 얼굴보다 먼저 그린다.
const BACK: Record<Style, string> = {
  longStraight: "M17,46 C13,10 87,10 83,46 L83,76 Q80,79 76,76 L74,42 Q74,30 65,26 Q58,23 50,24 Q42,23 35,26 Q26,30 26,42 L24,76 Q20,79 17,76 Z",
  longWavy: "M16,46 C12,10 88,10 84,46 Q86,64 80,78 Q85,82 78,80 Q75,70 77,60 Q75,42 66,29 Q58,24 50,25 Q42,24 34,29 Q25,42 23,60 Q25,70 22,80 Q15,82 20,78 Q14,64 16,46 Z",
  bangsLong: "M17,46 C13,10 87,10 83,46 L83,76 Q80,79 76,76 L74,42 Q74,30 65,26 Q58,23 50,24 Q42,23 35,26 Q26,30 26,42 L24,76 Q20,79 17,76 Z",
  ponytail: "M21,44 C16,11 84,11 79,44 L78,62 Q75,66 71,62 L70,42 Q70,31 62,27 L38,27 Q30,31 30,42 L29,62 Q25,66 22,62 Z",
  bob: "M20,46 C15,11 85,11 80,46 L79,60 Q77,66 70,65 L69,42 Q69,31 61,27 L39,27 Q31,31 31,42 L30,65 Q23,66 21,60 Z",
};

// 앞머리(얼굴 앞, 이목구비 위). 정수리를 확실히 덮는 캡(아치 control y≈8)이고,
// 가르마는 살색이 드러나는 홈 대신 앞머리 안에서 살짝 굴린 곡선으로만 표현한다(변발 방지).
const FRONT: Record<Style, string> = {
  longStraight: "M26,44 C21,8 79,8 74,44 C72,33 62,30 52,34 Q50,32 48,34 C38,30 28,33 26,44 Z",
  longWavy: "M26,44 C21,8 79,8 74,44 C73,33 65,31 55,34 C60,29 67,30 70,33 C61,26 39,26 30,33 C27,35 26,38 26,44 Z",
  bangsLong: "M26,45 C21,8 79,8 74,45 C74,38 71,35 64,35 L64,38 Q50,34 36,38 L36,35 C29,35 26,38 26,45 Z",
  ponytail: "M28,40 C24,9 76,9 72,40 C68,31 60,29 50,29 C40,29 32,31 28,40 Z",
  bob: "M26,45 C21,8 79,8 74,45 C74,34 64,31 57,34 Q53,37 50,37 Q47,37 43,34 C36,31 26,34 26,45 Z",
};

function FaceShape({ face }: { face: Face }) {
  const f = FACES[face];
  return (
    <g>
      <circle cx={f.ex} cy="43" r="5.2" fill={SKIN} />
      <circle cx={100 - f.ex} cy="43" r="5.2" fill={SKIN} />
      <path d={f.d} fill={SKIN} />
      <ellipse cx="38" cy="50" rx="4.2" ry="2.8" fill={BLUSH} opacity="0.55" />
      <ellipse cx="62" cy="50" rx="4.2" ry="2.8" fill={BLUSH} opacity="0.55" />
    </g>
  );
}

function Eyes({ eyes, hairColor }: { eyes: Eyes; hairColor: string }) {
  const iris = shade(hairColor, -0.05);
  const lid = "#4A3020";
  const open = (cx: number, rx: number, ry: number, key: string) => (
    <g key={key}>
      <ellipse cx={cx} cy="42" rx={rx} ry={ry} fill="#fff" />
      <circle cx={cx} cy="42.3" r={Math.min(rx, ry) * 0.95} fill={iris} />
      <circle cx={cx} cy="42.4" r={Math.min(rx, ry) * 0.45} fill="#241f1c" />
      <circle cx={cx + 1} cy="40.7" r={Math.min(rx, ry) * 0.3} fill="#fff" />
      <path d={`M${cx - rx},41.2 Q${cx},${42 - ry - 1.4} ${cx + rx},41.2`} stroke={lid} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </g>
  );
  switch (eyes) {
    case "bright":
      return <g>{open(40, 4.2, 4.4, "l")}{open(60, 4.2, 4.4, "r")}</g>;
    case "round":
      return <g>{open(40, 4.5, 4.8, "l")}{open(60, 4.5, 4.8, "r")}</g>;
    case "calm":
      return <g>{open(40, 3.8, 3.6, "l")}{open(60, 3.8, 3.6, "r")}</g>;
    case "soft":
      return <g>{open(40, 4, 3.3, "l")}{open(60, 4, 3.3, "r")}</g>;
    case "droopy":
      return (
        <g>
          {open(40, 3.9, 3.5, "l")}{open(60, 3.9, 3.5, "r")}
          <path d="M35,40 Q37,42 40,42.6" stroke={lid} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M65,40 Q63,42 60,42.6" stroke={lid} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "sleepy":
      return (
        <g stroke={lid} strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M36,42.5 Q40,44 44,42.5" />
          <path d="M56,42.5 Q60,44 64,42.5" />
        </g>
      );
    case "happy":
      return (
        <g stroke={lid} strokeWidth="2.2" fill="none" strokeLinecap="round">
          <path d="M35.5,43 Q40,38 44.5,43" />
          <path d="M55.5,43 Q60,38 64.5,43" />
        </g>
      );
  }
}

function MouthShape({ mouth }: { mouth: Mouth }) {
  const stroke = "#C76B76";
  const common = { stroke, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const };
  switch (mouth) {
    case "neutral":
      return <path d="M45,56 Q50,58 55,56" {...common} />;
    case "flat":
      return <path d="M45.5,56.5 L54.5,56.5" {...common} />;
    case "smile":
      return <path d="M44,55 Q50,60 56,55" {...common} />;
    case "softSmile":
      return <path d="M45,55.5 Q50,59 55,55.5" {...common} />;
    case "gentle":
      return <path d="M45,56 Q50,58.5 55,56" {...common} />;
    case "bigSmile":
      return (
        <g>
          <path d="M43,54.5 Q50,63 57,54.5 Z" fill="#fff" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M44.5,55.5 Q50,57.5 55.5,55.5" stroke="#E2A0A6" strokeWidth="1" fill="none" />
        </g>
      );
    case "grin":
      return <path d="M43,55 Q50,62 57,55 Z" fill="#fff" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />;
    case "gasp":
      return <ellipse cx="50" cy="56.5" rx="3" ry="3.8" fill="#8A4550" stroke={stroke} strokeWidth="1" />;
  }
}

/** 헐레벌떡 상태의 땀방울(오른쪽 관자놀이). */
function SweatDrop() {
  return <path d="M70,30 Q73,34.5 70,36.5 Q67,34.5 70,30 Z" fill="#7EC8F2" stroke="#4FA8E0" strokeWidth="0.6" />;
}

// 눈썹(상태에 따라 걱정/찡그림).
function Brows({ hairColor, mod }: { hairColor: string; mod?: "worry" | "focus" }) {
  const c = shade(hairColor, -0.12);
  const [l, r] =
    mod === "worry"
      ? ["M34,35.5 Q39,33.5 44,32.5", "M66,35.5 Q61,33.5 56,32.5"]
      : mod === "focus"
      ? ["M34,33 Q39,34.8 44,36", "M66,33 Q61,34.8 56,36"]
      : ["M34,35 Q39,33 44,34.6", "M56,34.6 Q61,33 66,35"];
  return (
    <g stroke={c} strokeWidth="1.7" strokeLinecap="round" fill="none">
      <path d={l} />
      <path d={r} />
    </g>
  );
}

export default function Fromis9Avatar({
  member,
  size = 56,
  state,
}: {
  member: string;
  size?: number;
  /** 있으면 해당 상태의 표정으로 오버라이드(대기·수정중·구현중). 없으면 멤버 기본 표정. */
  state?: string;
}) {
  const cfg = FROMIS_AVATARS[member];
  if (!cfg) return null;
  const f = stateFace(state, member);
  const eyes = f?.eyes ?? cfg.eyes;
  const mouth = f?.mouth ?? cfg.mouth;
  const bg = `fbg-${member}`;
  const hc = cfg.hairColor;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${member} 아바타`} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id={bg} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={shade(cfg.color, 0.5)} />
          <stop offset="100%" stopColor={cfg.color} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#${bg})`} />
      {/* 뒷머리(얼굴 뒤) */}
      <path d={BACK[cfg.style]} fill={shade(hc, -0.14)} />
      {/* 어깨/의상 */}
      <path d="M15,100 C15,79 31,71 50,71 C69,71 85,79 85,100 Z" fill={shade(cfg.color, -0.15)} />
      <path d="M50,71 C56,71 61,72 65,74 L61,81 Q50,77 39,81 L35,74 C39,72 44,71 50,71 Z" fill="#ffffff" opacity="0.22" />
      {/* 목 */}
      <rect x="45" y="57" width="10" height="16" rx="4.5" fill={SKIN} />
      <path d="M45,59 Q50,63 55,59 L55,61 Q50,64 45,61 Z" fill={SKIN_SHADE} opacity="0.7" />
      {/* 얼굴 */}
      <FaceShape face={cfg.face} />
      {/* 앞머리(정수리 캡 + 앞머리) */}
      <path d={FRONT[cfg.style]} fill={hc} />
      <path d={cfg.style === "ponytail" ? "M34,22 Q50,15 66,22" : "M32,21 Q50,14 68,21"} stroke={shade(hc, 0.3)} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
      {/* 눈썹 */}
      <Brows hairColor={hc} mod={f?.brow} />
      <Eyes eyes={eyes} hairColor={hc} />
      {/* 코 */}
      <path d="M50,45 L48.5,50 Q50,51.3 51.5,50" fill="none" stroke={SKIN_SHADE} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <MouthShape mouth={mouth} />
      {f?.sweat && <SweatDrop />}
    </svg>
  );
}

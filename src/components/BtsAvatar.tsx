// BTS 멤버 에이전트용 오리지널 SVG 아바타. 실제 사진 미사용 — 각 멤버의
// 시그니처(얼굴형·헤어 실루엣/컬러·눈매·소품)만 모티프로 한 스타일 일러스트다.

type Eyes = "calm" | "bright" | "sleepy" | "happy" | "soft" | "droopy" | "round";
type Mouth = "neutral" | "smile" | "flat" | "bigSmile" | "softSmile" | "gentle" | "grin";
type Hair = "short" | "neat" | "flat" | "swoop" | "soft" | "parted" | "messy";
type Face = "oval" | "round" | "long" | "angular" | "heart" | "slim" | "diamond";

type Cfg = {
  color: string; // 시그니처 색(배경·의상·카드 태그 공용)
  hairColor: string; // 헤어 베이스 색
  face: Face;
  hair: Hair;
  eyes: Eyes;
  mouth: Mouth;
  glasses?: boolean;
};

// 멤버별 설정. 얼굴형/헤어(모양+색)/눈/입/소품이 모두 달라 종류별로 확실히 구분된다.
export const BTS_AVATARS: Record<string, Cfg> = {
  RM: { color: "#5C6BC0", hairColor: "#2B2A2E", face: "angular", hair: "short", eyes: "calm", mouth: "neutral", glasses: true },
  진: { color: "#F48FB1", hairColor: "#6E4630", face: "round", hair: "neat", eyes: "bright", mouth: "smile" },
  슈가: { color: "#26A69A", hairColor: "#6FD6C6", face: "slim", hair: "flat", eyes: "sleepy", mouth: "flat" },
  제이홉: { color: "#FB8C00", hairColor: "#E1592E", face: "heart", hair: "swoop", eyes: "happy", mouth: "bigSmile" },
  지민: { color: "#F9A825", hairColor: "#E9C46A", face: "oval", hair: "soft", eyes: "soft", mouth: "softSmile" },
  뷔: { color: "#5C8DEF", hairColor: "#4B3524", face: "long", hair: "parted", eyes: "droopy", mouth: "gentle" },
  정국: { color: "#7E57C2", hairColor: "#241F2E", face: "diamond", hair: "messy", eyes: "round", mouth: "grin" },
};

export function btsColor(member: string): string | null {
  return BTS_AVATARS[member]?.color ?? null;
}

const SKIN = "#F6D2AE";
const SKIN_SHADE = "#E7B98D";
const BLUSH = "#F2A9A0";

function shade(hex: string, f: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) * (f < 0 ? 1 + f : 1) + (f > 0 ? 255 * f : 0));
  const g = cl(((n >> 8) & 255) * (f < 0 ? 1 + f : 1) + (f > 0 ? 255 * f : 0));
  const b = cl((n & 255) * (f < 0 ? 1 + f : 1) + (f > 0 ? 255 * f : 0));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

// 얼굴형 실루엣. d=윤곽선, ex=좌측 귀 중심 x(우측=100-ex).
const FACES: Record<Face, { d: string; ex: number }> = {
  oval: { d: "M50,15 C63,15 73,26 73,40 C73,54 63,66 50,66 C37,66 27,54 27,40 C27,26 37,15 50,15 Z", ex: 27 },
  round: { d: "M50,16 C65,16 75,28 75,41 C75,55 64,64 50,64 C36,64 25,55 25,41 C25,28 35,16 50,16 Z", ex: 25 },
  long: { d: "M50,14 C61,14 69,25 69,39 C69,57 60,71 50,71 C40,71 31,57 31,39 C31,25 39,14 50,14 Z", ex: 30 },
  angular: { d: "M50,15 C63,15 71,24 72,37 L72,46 C72,58 62,67 50,67 C38,67 28,58 28,46 L28,37 C29,24 37,15 50,15 Z", ex: 27 },
  heart: { d: "M50,15 C65,15 75,27 74,40 C73,52 60,68 50,68 C40,68 27,52 26,40 C25,27 35,15 50,15 Z", ex: 26 },
  slim: { d: "M50,16 C60,16 67,27 67,40 C67,54 59,65 50,65 C41,65 33,54 33,40 C33,27 40,16 50,16 Z", ex: 32 },
  diamond: { d: "M50,15 C58,15 66,21 70,33 C73,45 60,68 50,68 C40,68 27,45 30,33 C34,21 42,15 50,15 Z", ex: 30 },
};

function FaceShape({ face }: { face: Face }) {
  const f = FACES[face];
  return (
    <g>
      <circle cx={f.ex} cy="43" r="5.2" fill={SKIN} />
      <circle cx={100 - f.ex} cy="43" r="5.2" fill={SKIN} />
      <circle cx={f.ex} cy="43" r="2.4" fill={SKIN_SHADE} />
      <circle cx={100 - f.ex} cy="43" r="2.4" fill={SKIN_SHADE} />
      <path d={f.d} fill={SKIN} />
      {/* 볼터치 */}
      <ellipse cx="38" cy="50" rx="4.2" ry="2.8" fill={BLUSH} opacity="0.5" />
      <ellipse cx="62" cy="50" rx="4.2" ry="2.8" fill={BLUSH} opacity="0.5" />
    </g>
  );
}

// 헤어 베이스 실루엣(정수리를 꽉 덮음). 스타일별 앞머리/결이 다르다.
const HAIR_BASE: Record<Hair, string> = {
  short: "M23,47 C16,13 84,13 77,47 C75,34 70,30 61,31 Q55,27 50,28 Q45,27 39,31 C30,30 25,34 23,47 Z",
  neat: "M23,47 C16,12 84,13 77,47 C75,32 68,28 55,31 C60,26 67,25 71,28 C60,19 43,19 35,26 C29,29 25,34 23,47 Z",
  flat: "M23,47 C16,13 84,13 77,47 C76,39 73,35 66,35 L66,38 Q58,34 50,35 Q42,34 34,38 L34,35 C27,35 24,39 23,47 Z",
  swoop: "M25,47 C14,15 82,13 77,47 C75,30 69,27 57,30 C64,20 61,9 48,11 C56,14 55,22 47,27 C38,29 28,32 25,47 Z",
  soft: "M23,47 C16,12 84,13 77,47 C75,33 68,30 57,33 Q53,37 50,37 Q47,37 43,33 C32,30 25,33 23,47 Z",
  parted: "M23,47 C16,12 84,13 77,47 C75,31 65,28 52,33 L50,29 L48,33 C35,28 25,31 23,47 Z",
  messy: "M24,47 C16,14 83,14 76,47 C74,32 68,28 60,31 C57,28 43,28 40,31 C32,28 26,32 24,47 Z",
};

function Hair({ hair, color }: { hair: Hair; color: string }) {
  const hi = shade(color, 0.28); // 하이라이트(밝게)
  const lo = shade(color, -0.28); // 그림자(어둡게)
  return (
    <g>
      <path d={HAIR_BASE[hair]} fill={color} />
      {/* 결 그림자(밑머리) */}
      <path d={HAIR_BASE[hair]} fill={lo} opacity="0.25" transform="translate(0,1.5)" />
      <path d={HAIR_BASE[hair]} fill={color} />
      {/* 윤기(하이라이트 스윕) */}
      <path
        d={hair === "swoop" ? "M30,22 Q46,12 62,20" : "M32,21 Q50,14 68,21"}
        stroke={hi}
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* 삐친 머리 결(정국) */}
      {hair === "messy" && (
        <g fill={color}>
          <path d="M33,16 L28,6 L41,13 Z" />
          <path d="M50,12 L50,3 L59,11 Z" />
          <path d="M65,15 L72,6 L67,17 Z" />
        </g>
      )}
    </g>
  );
}

function Eyes({ eyes, hairColor }: { eyes: Eyes; hairColor: string }) {
  const iris = shade(hairColor, -0.1);
  const lid = "#5A4636";
  // 뜬 눈 한쪽 렌더(cx 중심)
  const open = (cx: number, rx: number, ry: number, key: string) => (
    <g key={key}>
      <ellipse cx={cx} cy="42" rx={rx} ry={ry} fill="#fff" />
      <circle cx={cx} cy="42.3" r={Math.min(rx, ry) * 0.92} fill={iris} />
      <circle cx={cx} cy="42.4" r={Math.min(rx, ry) * 0.45} fill="#241f1c" />
      <circle cx={cx + 1} cy="40.8" r={Math.min(rx, ry) * 0.28} fill="#fff" />
      <path d={`M${cx - rx},41.4 Q${cx},${42 - ry - 1.2} ${cx + rx},41.4`} stroke={lid} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  );
  switch (eyes) {
    case "bright":
      return <g>{open(40, 4, 4.2, "l")}{open(60, 4, 4.2, "r")}</g>;
    case "round":
      return <g>{open(40, 4.4, 4.6, "l")}{open(60, 4.4, 4.6, "r")}</g>;
    case "calm":
      return <g>{open(40, 3.6, 3.4, "l")}{open(60, 3.6, 3.4, "r")}</g>;
    case "soft":
      return <g>{open(40, 3.8, 3.1, "l")}{open(60, 3.8, 3.1, "r")}</g>;
    case "droopy":
      return (
        <g>
          {open(40, 3.7, 3.3, "l")}
          {open(60, 3.7, 3.3, "r")}
          <path d="M35,40 Q37,42 40,42.5" stroke={lid} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M65,40 Q63,42 60,42.5" stroke={lid} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      );
    case "sleepy":
      return (
        <g stroke={lid} strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M36,42.5 Q40,44 44,42.5" />
          <path d="M56,42.5 Q60,44 64,42.5" />
          <ellipse cx="40" cy="43.4" rx="2.6" ry="1.3" fill="#241f1c" stroke="none" />
          <ellipse cx="60" cy="43.4" rx="2.6" ry="1.3" fill="#241f1c" stroke="none" />
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

function Brows({ hairColor }: { hairColor: string }) {
  const c = shade(hairColor, -0.15);
  return (
    <g stroke={c} strokeWidth="1.8" strokeLinecap="round" fill="none">
      <path d="M34,35 Q39,33 44,34.6" />
      <path d="M56,34.6 Q61,33 66,35" />
    </g>
  );
}

function MouthShape({ mouth }: { mouth: Mouth }) {
  const stroke = "#B5615A";
  const common = { stroke, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const };
  switch (mouth) {
    case "neutral":
      return <path d="M45,56 Q50,58 55,56" {...common} />;
    case "flat":
      return <path d="M45.5,56.5 L54.5,56.5" {...common} />;
    case "smile":
      return <path d="M43,55 Q50,61 57,55" {...common} />;
    case "softSmile":
      return <path d="M45,55.5 Q50,59 55,55.5" {...common} />;
    case "gentle":
      return <path d="M45,56 Q50,58.5 55,56" {...common} />;
    case "bigSmile":
      return (
        <g>
          <path d="M42,54.5 Q50,65 58,54.5 Z" fill="#fff" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M43.5,55.5 Q50,58 56.5,55.5" stroke="#D98A84" strokeWidth="1" fill="none" />
        </g>
      );
    case "grin":
      return <path d="M42,55 Q50,63 58,55 Z" fill="#fff" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />;
  }
}

function Glasses() {
  return (
    <g stroke="#3A3A3A" strokeWidth="1.5" fill="#ffffff" fillOpacity="0.12">
      <rect x="32" y="37.5" width="13" height="9.5" rx="3.5" />
      <rect x="55" y="37.5" width="13" height="9.5" rx="3.5" />
      <path d="M45,41 L55,41" fill="none" />
      <path d="M32,40 L28,39.5" fill="none" />
      <path d="M68,40 L72,39.5" fill="none" />
    </g>
  );
}

export default function BtsAvatar({ member, size = 56 }: { member: string; size?: number }) {
  const cfg = BTS_AVATARS[member];
  if (!cfg) return null;
  const bg = `bg-${member}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${member} 아바타`} style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id={bg} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={shade(cfg.color, 0.5)} />
          <stop offset="100%" stopColor={cfg.color} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#${bg})`} />
      {/* 어깨/의상 */}
      <path d="M15,100 C15,78 31,70 50,70 C69,70 85,78 85,100 Z" fill={shade(cfg.color, -0.15)} />
      <path d="M50,70 C56,70 61,71 65,73 L61,80 Q50,76 39,80 L35,73 C39,71 44,70 50,70 Z" fill="#ffffff" opacity="0.22" />
      {/* 목 */}
      <rect x="44" y="56" width="12" height="18" rx="5" fill={SKIN} />
      <path d="M44,58 Q50,63 56,58 L56,60 Q50,64 44,60 Z" fill={SKIN_SHADE} opacity="0.7" />
      {/* 얼굴형(귀·볼터치 포함) */}
      <FaceShape face={cfg.face} />
      {/* 헤어 */}
      <Hair hair={cfg.hair} color={cfg.hairColor} />
      <Brows hairColor={cfg.hairColor} />
      <Eyes eyes={cfg.eyes} hairColor={cfg.hairColor} />
      {/* 코 */}
      <path d="M50,45 L48,50 Q50,51.5 52,50" fill="none" stroke={SKIN_SHADE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <MouthShape mouth={cfg.mouth} />
      {cfg.glasses && <Glasses />}
    </svg>
  );
}

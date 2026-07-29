/**
 * 오더(이슈)의 에이전트들에게 아바타 그룹(BTS·프로미스나인·IVE·도비)을 배정한다.
 * 규칙:
 *  - 한 오더의 에이전트는 같은 그룹으로 묶어 배정한다(그룹 응집).
 *  - 그룹 멤버가 오더의 에이전트 수보다 적으면 다음 그룹에서 이어 채운다(도움).
 *  - 오더별 primary 그룹은 25:25:25:25(BTS:프로미스:IVE:도비) 균등으로 결정적으로 고른다.
 *    → 여러 오더에 걸쳐 대략 그 비율로 분포. (도비는 무한 풀이라 소진되지 않는다.)
 */
import { BTS_AVATARS } from "@/components/BtsAvatar";
import { FROMIS_AVATARS } from "@/components/Fromis9Avatar";
import { IVE_AVATARS } from "@/lib/ive";

export type AvatarGroup = "bts" | "fromis" | "ive" | "dobby";
export type AssignedAvatar = { group: AvatarGroup; member?: string };

/** 오케스트레이터(오더를 지휘하는 메인 세션) 전용 슬러그. 에픽 그룹 멤버 하나로 핀 고정된다. */
export const ORCHESTRATOR_SLUG = "__orchestrator__";

const BTS = Object.keys(BTS_AVATARS); // 7명
const FROMIS = Object.keys(FROMIS_AVATARS); // 5명
const IVE = Object.keys(IVE_AVATARS); // 6명
const POOL: Record<AvatarGroup, string[]> = { bts: BTS, fromis: FROMIS, ive: IVE, dobby: [] };

/** 전체 그룹 목록. 그룹 균형(decay) 계산·순회용. */
export const AVATAR_GROUPS: AvatarGroup[] = ["bts", "fromis", "ive", "dobby"];

/** FNV-1a 해시(결정적 tiebreak용). */
export function avatarHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 그룹 대표 아바타(멤버 #0). 에픽 대표·오케스트레이터 폴백용. */
export function groupFirstMember(g: AvatarGroup): AssignedAvatar {
  return POOL[g].length ? { group: g, member: POOL[g][0] } : { group: "dobby" };
}

// 25:25:25:25 균등 primary 그룹(오더키로 결정적). 그룹 균형 강제 시 forcedPrimary로 대체.
function primaryGroup(epicKey: string): AvatarGroup {
  const r = avatarHash(epicKey) % 100;
  return r < 25 ? "bts" : r < 50 ? "fromis" : r < 75 ? "ive" : "dobby";
}

// primary가 소진되면 이어 채울 순서. 도비는 항상 마지막(무한).
const FILL_ORDER: Record<AvatarGroup, AvatarGroup[]> = {
  bts: ["bts", "fromis", "ive", "dobby"],
  fromis: ["fromis", "ive", "bts", "dobby"],
  ive: ["ive", "fromis", "bts", "dobby"],
  dobby: ["dobby", "bts", "fromis", "ive"],
};

/**
 * 오더의 에이전트 슬러그 목록 → 슬러그별 아바타 배정 맵.
 * 슬러그는 dedupe + 정렬해 상태 변화(칸반 이동)와 무관하게 안정적으로 배정한다.
 *
 * `existing`을 주면 **이미 배정된 슬러그는 그대로 유지**하고 신규 슬러그만
 * 그 에픽 그룹의 **미사용 멤버**로 이어 배정한다(핀 고정). → 에이전트가 추가돼도
 * 기존 담당은 안 바뀐다. existing에 있으나 현재 목록에 없는 슬러그도 유지한다(재등장 대비).
 */
export function assignOrderAvatars(
  epicKey: string,
  agentSlugs: string[],
  existing?: Map<string, AssignedAvatar> | Record<string, AssignedAvatar>,
  forcedPrimary?: AvatarGroup
): Map<string, AssignedAvatar> {
  const slugs = Array.from(new Set(agentSlugs.filter((s) => s && s !== "-"))).sort();
  const order = FILL_ORDER[forcedPrimary ?? primaryGroup(epicKey)];
  const pool = POOL;
  const usedNames: Record<AvatarGroup, Set<string>> = {
    bts: new Set(),
    fromis: new Set(),
    ive: new Set(),
    dobby: new Set(),
  };
  const map = new Map<string, AssignedAvatar>();
  // 기존 핀을 먼저 심고(유지), 사용된 멤버를 표시해 중복 배정을 막는다.
  const seed = existing instanceof Map ? existing : new Map(Object.entries(existing ?? {}));
  for (const [s, a] of seed) {
    map.set(s, a);
    if (a.member) usedNames[a.group].add(a.member);
  }
  let gi = 0;
  for (const slug of slugs) {
    if (map.has(slug)) continue; // 이미 핀됨 — 유지
    // 현재 그룹(도비 제외)이 소진됐으면 다음 그룹으로.
    while (order[gi] !== "dobby" && usedNames[order[gi]].size >= pool[order[gi]].length) gi++;
    const g = order[gi];
    if (g === "dobby") {
      map.set(slug, { group: "dobby" });
    } else {
      const member = pool[g].find((n) => !usedNames[g].has(n)) ?? pool[g][0];
      map.set(slug, { group: g, member });
      usedNames[g].add(member);
    }
  }
  return map;
}

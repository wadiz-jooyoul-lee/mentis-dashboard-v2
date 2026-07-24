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

const BTS = Object.keys(BTS_AVATARS); // 7명
const FROMIS = Object.keys(FROMIS_AVATARS); // 5명
const IVE = Object.keys(IVE_AVATARS); // 6명

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// 25:25:25:25 균등 primary 그룹(오더키로 결정적).
function primaryGroup(epicKey: string): AvatarGroup {
  const r = hash(epicKey) % 100;
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
 */
export function assignOrderAvatars(
  epicKey: string,
  agentSlugs: string[]
): Map<string, AssignedAvatar> {
  const slugs = Array.from(new Set(agentSlugs.filter((s) => s && s !== "-"))).sort();
  const order = FILL_ORDER[primaryGroup(epicKey)];
  const pool: Record<AvatarGroup, string[]> = { bts: BTS, fromis: FROMIS, ive: IVE, dobby: [] };
  const used: Record<AvatarGroup, number> = { bts: 0, fromis: 0, ive: 0, dobby: 0 };
  const map = new Map<string, AssignedAvatar>();
  let gi = 0;
  for (const slug of slugs) {
    // 현재 그룹(도비 제외)이 소진됐으면 다음 그룹으로.
    while (order[gi] !== "dobby" && used[order[gi]] >= pool[order[gi]].length) gi++;
    const g = order[gi];
    if (g === "dobby") {
      map.set(slug, { group: "dobby" });
    } else {
      map.set(slug, { group: g, member: pool[g][used[g]] });
      used[g] += 1;
    }
  }
  return map;
}

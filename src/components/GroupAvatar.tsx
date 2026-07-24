"use client";

import { Popover } from "antd";
import BtsAvatar from "@/components/BtsAvatar";
import Fromis9Avatar from "@/components/Fromis9Avatar";
import IveAvatar from "@/components/IveAvatar";
import DobbyIcon, { dobbyExpression } from "@/components/DobbyIcon";
import { dobbyColor } from "@/lib/dobby";
import type { AssignedAvatar } from "@/lib/avatarAssign";
import type { Quip } from "@/lib/quips";

const MOOD_EMOJI: Record<string, string> = {
  happy: "😊",
  cheer: "🎉",
  complain: "😤",
  ponder: "🤔",
  chill: "😎",
  tired: "😮‍💨",
  bored: "😐",
};

/**
 * 오더의 에이전트에 배정된 그룹 아바타를 그린다.
 * bts/fromis = 멤버 오리지널 SVG(상태로 표정 반영), 그 외/미배정 = 도비 아이콘.
 * quip이 있으면 호버 시 말풍선(성격대로 남긴 소감)을 띄운다(재미기능, 없으면 그냥 아바타).
 */
export default function GroupAvatar({
  slug,
  avatar,
  state,
  size = 34,
  quip,
}: {
  slug: string;
  avatar?: AssignedAvatar;
  state?: string;
  size?: number;
  quip?: Quip | null;
}) {
  const icon =
    avatar?.group === "bts" && avatar.member ? (
      <BtsAvatar member={avatar.member} size={size} state={state} />
    ) : avatar?.group === "fromis" && avatar.member ? (
      <Fromis9Avatar member={avatar.member} size={size} state={state} />
    ) : avatar?.group === "ive" && avatar.member ? (
      <IveAvatar member={avatar.member} size={size} state={state} />
    ) : (
      <DobbyIcon size={size} expression={dobbyExpression(state ?? "")} color={dobbyColor(slug)} />
    );

  if (!quip?.text) return icon;

  return (
    <Popover
      trigger="hover"
      overlayStyle={{ maxWidth: 240 }}
      content={
        <span style={{ fontSize: 13, lineHeight: 1.4 }}>
          {MOOD_EMOJI[quip.mood] ?? "💬"} {quip.text}
        </span>
      }
    >
      <span style={{ display: "inline-flex", cursor: "help" }}>{icon}</span>
    </Popover>
  );
}

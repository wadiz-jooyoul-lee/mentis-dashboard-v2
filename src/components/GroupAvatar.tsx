"use client";

import { Popover } from "antd";
import BtsAvatar from "@/components/BtsAvatar";
import Fromis9Avatar from "@/components/Fromis9Avatar";
import IveAvatar from "@/components/IveAvatar";
import ResceneAvatar from "@/components/ResceneAvatar";
import DobbyIcon, { dobbyExpression } from "@/components/DobbyIcon";
import { dobbyColor } from "@/lib/dobby";
import type { AssignedAvatar } from "@/lib/avatarAssign";
import type { Quip } from "@/lib/quips";

/** 그룹 표시 이름(에픽 대표 아바타 말풍선용). */
const GROUP_NAME: Record<string, string> = {
  bts: "방탄소년단",
  fromis: "프로미스나인",
  ive: "아이브",
  rescene: "리센느",
  dobby: "도비",
};

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
  name,
  avatar,
  state,
  size = 34,
  quip,
  showGroup = false,
}: {
  slug: string;
  /** 에이전트 역할 이름(예: 리뷰어, 개발자·지면). 말풍선 상단에 "{역할}: {멤버}"로 표시. */
  name?: string;
  avatar?: AssignedAvatar;
  state?: string;
  size?: number;
  quip?: Quip | null;
  /** true면 말풍선 헤더를 멤버/역할 대신 **그룹 이름**(방탄소년단·프로미스나인·아이브·도비)으로 표시. */
  showGroup?: boolean;
}) {
  const icon =
    avatar?.group === "bts" && avatar.member ? (
      <BtsAvatar member={avatar.member} size={size} state={state} />
    ) : avatar?.group === "fromis" && avatar.member ? (
      <Fromis9Avatar member={avatar.member} size={size} state={state} />
    ) : avatar?.group === "ive" && avatar.member ? (
      <IveAvatar member={avatar.member} size={size} state={state} />
    ) : avatar?.group === "rescene" && avatar.member ? (
      <ResceneAvatar member={avatar.member} size={size} state={state} />
    ) : (
      <DobbyIcon size={size} expression={dobbyExpression(state ?? "")} color={dobbyColor(slug)} />
    );

  // 아바타 캐릭터(멤버) 이름. 도비 그룹은 "도비".
  const member = avatar?.member ?? (avatar?.group === "dobby" ? "도비" : undefined);
  // 말풍선 상단 헤더: showGroup이면 그룹 이름, 아니면 "{역할}: {멤버}"(둘 다 있으면)·있는 쪽만.
  const header = showGroup
    ? avatar
      ? GROUP_NAME[avatar.group]
      : undefined
    : name && member
    ? `${name}: ${member}`
    : member ?? name;

  // 헤더도 소감도 없으면 그냥 아이콘(말풍선 X).
  if (!quip?.text && !header) return icon;

  return (
    <Popover
      trigger="hover"
      overlayStyle={{ maxWidth: 240 }}
      content={
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          {header && (
            <div style={{ fontWeight: 600, marginBottom: quip?.text ? 4 : 0 }}>{header}</div>
          )}
          {quip?.text && (
            <div>
              {MOOD_EMOJI[quip.mood] ?? "💬"} {quip.text}
            </div>
          )}
        </div>
      }
    >
      <span style={{ display: "inline-flex", cursor: "help" }}>{icon}</span>
    </Popover>
  );
}

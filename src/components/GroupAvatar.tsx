"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "antd";
import BtsAvatar from "@/components/BtsAvatar";
import Fromis9Avatar from "@/components/Fromis9Avatar";
import IveAvatar from "@/components/IveAvatar";
import ResceneAvatar from "@/components/ResceneAvatar";
import DobbyIcon, { dobbyExpression } from "@/components/DobbyIcon";
import { dobbyColor } from "@/lib/dobby";
import type { AssignedAvatar } from "@/lib/avatarAssign";
import type { Quip } from "@/lib/quipTypes";

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

/** 말풍선을 띄울 방향. 칸반은 옆 열이 빈 쪽으로 띄우고, 양옆이 다 차 있으면 위로 띄운다. */
export type QuipPlacement = "left" | "right" | "top";

/**
 * 자동 재생 타이밍(밀리초). 고정 박자는 몇 번만 봐도 주기가 읽혀 기계처럼 보이므로
 * 매 사이클 범위에서 새로 뽑는다. 보여주는 시간의 하한은 한글 두 줄을 읽을 만큼 둔다.
 */
const ENTER_MS: [number, number] = [0, 5000]; // 첫 등장 — 카드마다 엇갈리게
const SHOW_MS: [number, number] = [8000, 14000];
const REST_MS: [number, number] = [3000, 7000];

const rand = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);

/**
 * 소감을 섞어 한 바퀴 다 쓴 뒤 다시 섞는 "주머니".
 * 매번 순수 난수를 뽑으면 같은 소감이 연달아 나와 멈춘 것처럼 보여서 쓰지 않는다.
 */
function makeBag(getList: () => Quip[]) {
  let bag: Quip[] = [];
  let last: Quip | null = null;
  return (): Quip | null => {
    const list = getList();
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    if (bag.length === 0) {
      bag = [...list];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // 바퀴가 바뀌는 자리에서 직전 소감이 또 나오지 않게 한 칸 밀어 둔다.
      if (last && bag[bag.length - 1] === last) {
        [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
      }
    }
    last = bag.pop() ?? null;
    return last;
  };
}

/** 칸반용 자동 재생. 보여줬다 쉬었다를 반복하며 매번 다른 소감을 고른다. */
function useAutoQuip(quips: Quip[], enabled: boolean) {
  const [quip, setQuip] = useState<Quip | null>(null);
  const quipsRef = useRef(quips);
  quipsRef.current = quips;
  const holdRef = useRef(false); // 호버 중이면 읽는 중이므로 붙잡아 둔다

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const nextQuip = makeBag(() => quipsRef.current);
    const at = (ms: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (alive) fn();
      }, ms);
    };

    const show = () => {
      if (document.hidden) return at(2000, show); // 안 보이는 탭에서는 그리지 않는다
      const list = quipsRef.current;
      if (list.length === 0) return at(5000, show);
      setQuip(nextQuip());
      at(rand(SHOW_MS), hide);
    };
    const hide = () => {
      if (holdRef.current) return at(1000, hide);
      setQuip(null);
      at(rand(REST_MS), show);
    };

    at(rand(ENTER_MS), show);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // ⛔ quips·콜백을 의존성에 넣지 않는다. 넣으면 머리띠의 30초 자동 갱신이
    //    router.refresh() 를 부를 때마다 타이머가 처음부터 다시 시작돼 주기가 어긋난다.
    //    최신 소감은 quipsRef 로 본다.
  }, [enabled]);

  return { quip, holdRef };
}

/** 칸반 밖(리뷰·오케스트레이터·코드 변경)용. 호버할 때마다 하나를 새로 고른다. */
function useHoverQuip(quips: Quip[]) {
  const quipsRef = useRef(quips);
  quipsRef.current = quips;
  const nextQuip = useMemo(() => makeBag(() => quipsRef.current), []);
  const [quip, setQuip] = useState<Quip | null>(null);
  return {
    quip,
    onOpenChange: (open: boolean) => {
      if (open) setQuip(nextQuip());
    },
  };
}

/**
 * 오더의 에이전트에 배정된 그룹 아바타를 그린다.
 * bts/fromis = 멤버 오리지널 SVG(상태로 표정 반영), 그 외/미배정 = 도비 아이콘.
 * 소감이 있으면 말풍선을 띄운다(재미기능, 없으면 그냥 아바타).
 * - mode="hover"(기본): 호버할 때마다 소감 하나를 랜덤으로 보여준다.
 * - mode="auto": 호버 없이 스스로 보여줬다 쉬었다 하며 소감을 바꿔 간다(칸반 보드).
 */
export default function GroupAvatar({
  slug,
  name,
  avatar,
  state,
  size = 34,
  quips = [],
  mode = "hover",
  placement,
  showGroup = false,
}: {
  slug: string;
  /** 에이전트 역할 이름(예: 리뷰어, 개발자·지면). 말풍선 상단에 "{역할}: {멤버}"로 표시. */
  name?: string;
  avatar?: AssignedAvatar;
  state?: string;
  size?: number;
  /** 이 에이전트의 소감 목록(quipList로 편 것). 비어 있으면 말풍선 없음. */
  quips?: Quip[];
  mode?: "hover" | "auto";
  /** mode="auto"일 때 말풍선 방향. 생략하면 antd 기본값. */
  placement?: QuipPlacement;
  /** true면 말풍선 헤더를 멤버/역할 대신 **그룹 이름**(방탄소년단·프로미스나인·아이브·도비)으로 표시. */
  showGroup?: boolean;
}) {
  // 아바타 SVG는 노드가 많다. 말풍선이 열고 닫힐 때마다 다시 그리지 않도록 떼어 둔다.
  const icon = useMemo(
    () =>
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
      ),
    [avatar, state, size, slug]
  );

  // 소감이 하나뿐이면 스스로 말하지 않는다 — 바꿔 가며 보여줄 것이 없는데 계속 띄우면
  // 카드 수만큼 말풍선이 떠 있어 칸반을 가리고, 같은 말을 껐다 켜면 깜빡임만 된다.
  const speaks = mode === "auto" && quips.length >= 2;
  const auto = useAutoQuip(quips, speaks);
  const hover = useHoverQuip(quips);
  const quip = speaks ? auto.quip : hover.quip;

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

  // 보여줄 소감도 헤더도 없으면 그냥 아이콘(말풍선 X).
  if (quips.length === 0 && !header) return icon;

  // 스스로 뜨는 말풍선은 칸반 카드 간격(약 127px) 안에 들어가야 옆 카드의 말풍선과 겹치지 않는다.
  // 긴 소감은 세 줄에서 끊는다(호버로 띄울 때는 사용자가 직접 본 것이므로 끊지 않는다).
  const clamp =
    speaks
      ? ({
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 3,
          overflow: "hidden",
        } as const)
      : undefined;

  const content = (
    <div style={{ fontSize: 13, lineHeight: 1.4 }}>
      {header && <div style={{ fontWeight: 600, marginBottom: quip?.text ? 4 : 0 }}>{header}</div>}
      {quip?.text && (
        <div style={clamp}>
          {MOOD_EMOJI[quip.mood] ?? "💬"} {quip.text}
        </div>
      )}
    </div>
  );

  if (speaks) {
    return (
      <Popover
        open={!!quip}
        placement={placement}
        // 스스로 떠 있는 말풍선이 마우스를 가로채면 그 자리의 카드를 누를 수 없다.
        overlayStyle={{ maxWidth: 320, pointerEvents: "none" }}
        content={content}
      >
        <span
          style={{ display: "inline-flex" }}
          onMouseEnter={() => {
            auto.holdRef.current = true; // 읽는 중에 사라지지 않게 붙잡는다
          }}
          onMouseLeave={() => {
            auto.holdRef.current = false;
          }}
        >
          {icon}
        </span>
      </Popover>
    );
  }

  return (
    <Popover
      trigger="hover"
      onOpenChange={hover.onOpenChange}
      placement={placement}
      overlayStyle={{ maxWidth: 320 }}
      content={content}
    >
      <span style={{ display: "inline-flex", cursor: "help" }}>{icon}</span>
    </Popover>
  );
}

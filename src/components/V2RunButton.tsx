"use client";

import { useCanAct } from "@/components/CanAct";
import { NextActionControls, refreshNextActions, useNextActions } from "@/components/NextAction";
import { useState } from "react";
import { Button, Tooltip } from "antd";
import { PlayCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { ORDER_QUESTION_ID } from "@/components/OrderQuestion";

/** 마우스를 올렸을 때 마지막 판정이 이보다 오래됐으면 다시 판정한다. */
const STALE_MS = 5_000;

/**
 * 오더 머리글의 "자동 실행" 자리 — 알림 카드와 같은 판정(다음 할 일)으로 같은 버튼을 그린다.
 * 할 일이 없으면 꺼진 버튼에 카드 문구를 보여 준다. 질문이 있으면 본문 맨 위 질문 카드로 내려가는 버튼을 그린다.
 */
export default function V2RunButton({ epicKey }: { epicKey: string }) {
  const canAct = useCanAct();
  const { items, at } = useNextActions();
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    if (checking || Date.now() - at <= STALE_MS) return;
    setChecking(true);
    await refreshNextActions(true);
    setChecking(false);
  };

  // 다른 기기에서 열람 중이면 실행 버튼을 그리지 않는다(서버 가드는 별도).
  if (!canAct) return null;
  const item = items.find((i) => i.key === epicKey);
  // 질문은 버튼 줄에 다 들어가지 않는다. 오더 화면 본문 맨 위의 질문 카드가 그리고, 여기서는 그 카드로 내려가는 버튼만 둔다.
  if (item?.action === "ask" && item.ask) {
    return (
      <Tooltip title={item.text}>
        <Button
          type="link"
          icon={<QuestionCircleOutlined />}
          style={{ color: "#fa541c" }}
          onClick={() => document.getElementById(ORDER_QUESTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          답을 기다리는 중
        </Button>
      </Tooltip>
    );
  }
  const actionable = !!item && !!(item.action || item.cmd || item.link);
  return (
    <span onMouseEnter={recheck}>
      {actionable && !checking ? (
        <NextActionControls item={item} />
      ) : (
        <Tooltip title={item?.text ?? "자동으로 진행할 일이 없습니다"}>
          <Button type="link" icon={<PlayCircleOutlined />} disabled loading={checking}>
            {item?.group === "auto" ? "자동 실행 중" : "자동 실행"}
          </Button>
        </Tooltip>
      )}
    </span>
  );
}

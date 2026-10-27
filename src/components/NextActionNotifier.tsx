"use client";

import { useEffect, useRef } from "react";
import { Space, Typography, notification } from "antd";
import { BellTwoTone } from "@ant-design/icons";
import { useCanAct } from "@/components/CanAct";
import { NextActionControls, formatSince, useNextActions, type NextItem } from "@/components/NextAction";

const { Text } = Typography;

/** 닫은 카드 기록(브라우저 저장소). 상태가 바뀌면 카드 아이디가 달라져 다시 뜬다. */
const ACK_STORE = "mentis.next.ack";
const cardId = (i: NextItem) => `${i.key}|${i.kind}|${i.since}`;

function readAcks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ACK_STORE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function addAck(id: string): void {
  try {
    localStorage.setItem(ACK_STORE, JSON.stringify([...readAcks().filter((x) => x !== id), id].slice(-200)));
  } catch {
    /* 저장 못 하면 새로고침 때 다시 뜰 뿐이다 */
  }
}

/**
 * 내 차례 알림 — 모든 화면 오른쪽 위에 "내 차례"인 오더마다 카드를 띄운다.
 * 내 차례가 끝나면(상태가 바뀌면) 카드는 저절로 닫힌다. 탭 제목 앞 숫자는 지금 내 차례인 오더 수다.
 * 탭이 뒤에 있을 때 새로 내 차례가 된 오더는 맥 알림 센터에도 알린다.
 */
export default function NextActionNotifier() {
  const canAct = useCanAct();
  const { items, loaded } = useNextActions();
  const [api, holder] = notification.useNotification({ top: 72, stack: { threshold: 4 } });
  const open = useRef(new Map<string, NextItem>());
  const first = useRef(true);
  const mine = items.filter((i) => i.group === "mine");

  useEffect(() => {
    if (!canAct || !loaded) return;
    const now = new Map(mine.map((i) => [cardId(i), i]));
    for (const id of open.current.keys()) {
      if (!now.has(id)) {
        api.destroy(id);
        open.current.delete(id);
      }
    }
    const acks = new Set(readAcks());
    for (const [id, i] of now) {
      if (open.current.has(id) || acks.has(id)) continue;
      open.current.set(id, i);
      api.open({
        key: id,
        duration: 0,
        icon: <BellTwoTone twoToneColor="#fa541c" />,
        title: `${i.key} · ${i.text}`,
        description: (
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            {i.title && <Text strong>{i.title}</Text>}
            {i.since && <Text type="secondary" style={{ fontSize: 12 }}>{formatSince(i.since)}</Text>}
            {i.note && <Text type="secondary" style={{ fontSize: 12 }}>멈춘 이유: {i.note}</Text>}
            <NextActionControls item={i} showOpen />
          </Space>
        ),
        onClose: () => {
          addAck(id);
          open.current.delete(id);
        },
      });
      if (!first.current) notifyOs(i);
    }
    first.current = false;
    // mine 은 items 에서 매번 새로 만든다. items 가 바뀔 때만 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loaded, canAct, api]);

  // 탭 제목 앞에 내 차례 수. 화면 이동 때 제목이 바뀔 수 있어 주기마다 다시 붙인다.
  const count = canAct ? mine.length : 0;
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\)\s*/, "");
      const next = count > 0 ? `(${count}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    const id = setInterval(apply, 2000);
    return () => clearInterval(id);
  }, [count]);

  return holder;
}

function notifyOs(i: NextItem) {
  if (typeof Notification === "undefined" || !window.isSecureContext) return;
  if (Notification.permission !== "granted" || document.hasFocus()) return;
  const n = new Notification(`${i.key} · 내 차례`, { body: [i.text, i.title].filter(Boolean).join("\n"), tag: cardId(i) });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

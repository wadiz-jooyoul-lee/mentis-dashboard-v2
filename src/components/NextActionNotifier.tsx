"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfigProvider, Space, Tag, Typography, notification } from "antd";
import { BellTwoTone, BulbTwoTone } from "@ant-design/icons";
import { useCanAct } from "@/components/CanAct";
import { NextActionControls, formatSince, useNextActions, type AutoDecisionNote, type NextItem } from "@/components/NextAction";

const { Text } = Typography;

/** 닫은 카드 기록(브라우저 저장소). 상태가 바뀌면 카드 아이디가 달라져 다시 뜬다. */
const ACK_STORE = "mentis.next.ack";
const cardId = (i: NextItem) => `${i.key}|${i.kind}|${i.since}`;
/** 스스로 정한 결정 알림의 아이디. 결정이 더해지면 지문이 달라져 한 번 더 뜬다. */
const noteId = (n: AutoDecisionNote) => `${n.key}|auto-decision|${n.sig}`;

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
 * TODO·알림 카드 — 모든 화면 오른쪽 위에 TODO(할 일 있음)와 알림인 오더마다 카드를 띄운다. 닫으면 다시 뜨지 않는다.
 * 상태가 바뀌면 카드는 저절로 닫힌다. 탭 제목 앞 숫자는 TODO 오더 수다.
 * 탭이 뒤에 있을 때 새로 뜬 카드는 맥 알림 센터에도 알린다.
 * 자동 실행이 사람에게 묻지 않고 스스로 정한 결정이 새로 생기면 오더마다 한 번 알린다. 이 알림은 TODO 수에 세지 않는다.
 */
export default function NextActionNotifier() {
  const canAct = useCanAct();
  const { items, notes, loaded } = useNextActions();
  const router = useRouter();
  const openNotes = useRef(new Set<string>());
  const [api, holder] = notification.useNotification({ top: 72, stack: { threshold: 4 } });
  const open = useRef(new Map<string, NextItem>());
  const first = useRef(true);
  const mine = items.filter((i) => i.group === "mine");
  const cards = items.filter((i) => i.group === "mine" || i.group === "notice");

  useEffect(() => {
    if (!canAct || !loaded) return;
    const now = new Map(cards.map((i) => [cardId(i), i]));
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
        icon: <BellTwoTone twoToneColor={i.group === "mine" ? "#fa541c" : "#13c2c2"} />,
        title: `${i.key} · ${i.text}`,
        description: (
          // 카드(2050)보다 안쪽 확인창·목록이 위에 뜨도록 팝업 기본값을 올린다(기본 1000).
          <ConfigProvider theme={{ token: { zIndexPopupBase: 2100 } }}>
            <Space orientation="vertical" size={6} style={{ width: "100%" }}>
              {i.title && <Text strong>{i.title}</Text>}
              {i.since && <Text type="secondary" style={{ fontSize: 12 }}>{formatSince(i.since)}</Text>}
              {i.note && <Text type="secondary" style={{ fontSize: 12 }}>멈춘 이유: {i.note}</Text>}
              <NextActionControls
                item={i}
                showOpen
                onDone={() => {
                  // 실행하면 카드를 닫아 뒤에 쌓인 카드가 보이게 한다.
                  addAck(id);
                  open.current.delete(id);
                  api.destroy(id);
                }}
              />
            </Space>
          </ConfigProvider>
        ),
        onClose: () => {
          addAck(id);
          open.current.delete(id);
        },
      });
      if (!first.current) notifyOs(i);
    }
    first.current = false;
    // cards 는 items 에서 매번 새로 만든다. items 가 바뀔 때만 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loaded, canAct, api]);

  // 스스로 정한 결정 — 새로 생기면 한 번 알린다. 닫거나 열어 보면 다시 뜨지 않고, 오더가 끝나 목록에서 빠지면 저절로 닫힌다.
  useEffect(() => {
    if (!canAct || !loaded) return;
    const now = new Map(notes.map((n) => [noteId(n), n]));
    for (const id of [...openNotes.current]) {
      if (!now.has(id)) {
        api.destroy(id);
        openNotes.current.delete(id);
      }
    }
    const acks = new Set(readAcks());
    for (const [id, n] of now) {
      if (openNotes.current.has(id) || acks.has(id)) continue;
      openNotes.current.add(id);
      const done = () => {
        addAck(id);
        openNotes.current.delete(id);
      };
      api.open({
        key: id,
        duration: 0,
        icon: <BulbTwoTone twoToneColor="#722ed1" />,
        title: `${n.key} · 스스로 정한 결정 ${n.count}건`,
        description: (
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            {n.title && <Text strong>{n.title}</Text>}
            <Text style={{ fontSize: 12 }}>
              사람에게 묻지 않고 진행하면서 정했습니다. 최근 결정: {n.what}
              {n.pick && ` → ${n.pick}`}
            </Text>
            <Space size={6} wrap>
              {n.check > 0 && (
                <Tag color="orange" style={{ margin: 0 }}>
                  확인해 보세요 {n.check}건
                </Tag>
              )}
              <Button
                size="small"
                onClick={() => {
                  done();
                  api.destroy(id);
                  router.push(`/orchestration/${encodeURIComponent(n.key)}#auto-decisions`);
                }}
              >
                결정 보기
              </Button>
            </Space>
          </Space>
        ),
        onClose: done,
      });
    }
  }, [notes, loaded, canAct, api, router]);

  // 탭 제목 앞에 TODO 수(알림은 세지 않는다). 화면 이동 때 제목이 바뀔 수 있어 주기마다 다시 붙인다.
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
  const n = new Notification(`${i.key} · ${i.group === "mine" ? "TODO" : "알림"}`, { body: [i.text, i.title].filter(Boolean).join("\n"), tag: cardId(i) });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

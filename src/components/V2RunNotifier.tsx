"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Space, Typography, message, notification } from "antd";
import { CheckCircleTwoTone, CopyOutlined, WarningTwoTone } from "@ant-design/icons";
import { useCanAct } from "@/components/CanAct";
import { copyText } from "@/lib/clipboard";

const { Text } = Typography;

type Run = {
  key: string;
  title: string | null;
  ok: boolean;
  startedAt: number;
  endedAt: number;
  result: string | null;
  commands: { repo: string; branch: string; command: string }[];
};

/** 닫은 알림 기록(브라우저 저장소). 같은 오더를 다시 돌리면 시작 시각이 달라 새 알림이 된다. */
const ACK_STORE = "mentis.v2run.ack";
const runId = (r: Run) => `${r.key}@${r.startedAt}`;

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

/** 결과 문장에서 `복기: …` 명령 꼬리는 뺀다(카드는 이어가기 명령만 준다). */
const resultLine = (r: Run) => r.result?.replace(/\s*복기:.*$/, "").replace(/^자동 실행 중단:\s*/, "") ?? null;

/**
 * /do 자동 실행 완료 알림 — 모든 화면에서 끝난 자동 실행을 찾아 오른쪽 위에 카드를 띄운다.
 * 카드에서 이어가기 명령을 바로 복사한다. 탭이 뒤에 있으면 맥 알림 센터에도 알리고,
 * 확인 안 한 개수를 탭 제목 앞에 붙인다. 명령에 이 맥 경로가 들어 있어 다른 기기에서는 끈다.
 */
export default function V2RunNotifier({ intervalMs = 10000 }: { intervalMs?: number }) {
  const canAct = useCanAct();
  const router = useRouter();
  const [api, holder] = notification.useNotification({ top: 72, stack: false });
  const open = useRef(new Set<string>());
  const first = useRef(true);
  const [count, setCount] = useState(0);

  const close = useCallback(
    (id: string) => {
      addAck(id);
      open.current.delete(id);
      setCount(open.current.size);
    },
    []
  );

  const show = useCallback(
    (r: Run) => {
      const id = runId(r);
      const copy = async (command: string) => {
        if (await copyText(command)) message.success("이어가기 명령을 복사했습니다. 터미널에 붙여넣으세요.");
        else message.error("복사 실패 — 오더 화면의 이어가기 v2 에서 복사하세요");
      };
      api.open({
        key: id,
        duration: 0,
        icon: r.ok ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : <WarningTwoTone twoToneColor="#faad14" />,
        title: `${r.key} 자동 실행 ${r.ok ? "완료" : "멈춤"}`,
        description: (
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            {r.title && <Text strong>{r.title}</Text>}
            {resultLine(r) && <Text type="secondary" style={{ fontSize: 12 }}>{resultLine(r)}</Text>}
            <Space wrap size={6}>
              {r.commands.map((c) => (
                <Button key={c.repo} size="small" type="primary" icon={<CopyOutlined />} onClick={() => copy(c.command)}>
                  {r.commands.length > 1 ? `이어가기 명령 복사 (${c.repo})` : "이어가기 명령 복사"}
                </Button>
              ))}
              <Button size="small" onClick={() => router.push(`/orchestration/${encodeURIComponent(r.key)}`)}>
                오더 열기
              </Button>
            </Space>
          </Space>
        ),
        onClose: () => close(id),
      });
      open.current.add(id);
      setCount(open.current.size);
    },
    [api, close, router]
  );

  const notifyOs = (r: Run) => {
    if (typeof Notification === "undefined" || !window.isSecureContext) return;
    if (Notification.permission !== "granted" || document.hasFocus()) return;
    const n = new Notification(`${r.key} 자동 실행 ${r.ok ? "완료" : "멈춤"}`, {
      body: [r.title, resultLine(r)].filter(Boolean).join("\n"),
      tag: runId(r),
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  };

  const poll = useCallback(async () => {
    let runs: Run[] = [];
    try {
      runs = (await (await fetch("/api/orders?v2finished=1", { cache: "no-store" })).json()).runs ?? [];
    } catch {
      return;
    }
    const acks = new Set(readAcks());
    for (const r of runs) {
      const id = runId(r);
      if (acks.has(id) || open.current.has(id)) continue;
      show(r);
      // 대시보드를 닫아 둔 동안 끝난 것은 카드로만 보여 준다.
      if (!first.current) notifyOs(r);
    }
    first.current = false;
  }, [show]);

  useEffect(() => {
    if (!canAct) return;
    poll();
    // 탭이 뒤에 있어도 돈다 — 그때 맥 알림을 띄워야 하므로(브라우저가 주기를 늦출 뿐이다).
    const id = setInterval(poll, intervalMs);
    return () => clearInterval(id);
  }, [canAct, poll, intervalMs]);

  // 탭 제목 앞에 확인 안 한 개수. 화면 이동 때 제목이 바뀔 수 있어 주기마다 다시 붙인다.
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

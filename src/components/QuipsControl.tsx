"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, message } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

/**
 * 아바타 소감(재미기능) 트리거 + 수동 새로고침 버튼.
 * 마운트 시 상태 확인 → 없음/오래됨이면 백그라운드 생성 시작(논블로킹), 폴링 후 완료되면 새로고침.
 * 수동(버튼) 실행이 실패하면 원인과 함께 에러 토스트를 띄운다. 자동 트리거 실패는 조용히 넘어간다.
 */
export default function QuipsControl({ epicKey }: { epicKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const polls = useRef(0);
  const triggered = useRef(false);
  const manualRef = useRef(false); // 현재 진행 중인 실행이 수동(버튼)인지

  const stopPoll = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const fail = (msg: string) => {
    if (manualRef.current) message.error(msg);
  };

  const poll = useCallback(async () => {
    polls.current += 1;
    if (polls.current > 30) {
      stopPoll();
      setBusy(false);
      fail("소감 생성 시간 초과 — 잠시 후 다시 시도해 주세요.");
      return;
    }
    try {
      const s = await (
        await fetch(`/api/orders?quips=${encodeURIComponent(epicKey)}`, { cache: "no-store" })
      ).json();
      if (s.jobState === "running") {
        setBusy(true);
        return;
      }
      stopPoll();
      setBusy(false);
      if (!s.stale) {
        router.refresh(); // 최신 파일 준비됨 → 말풍선 반영(성공)
        return;
      }
      // 잡이 끝났는데 최신 소감 파일이 없음 = 실패
      fail(
        `소감 생성 실패 — ${
          s.reason || "스킬이 소감 파일을 만들지 못했습니다 (스킬 미설치·오류 가능)"
        }`
      );
    } catch {
      stopPoll();
      setBusy(false);
      fail("소감 상태 확인 실패 — 네트워크를 확인해 주세요.");
    }
  }, [epicKey, router]);

  const start = useCallback(
    async (manual: boolean) => {
      manualRef.current = manual;
      try {
        const st = await (
          await fetch(`/api/orders?quips=${encodeURIComponent(epicKey)}`, { cache: "no-store" })
        ).json();
        if (st.jobState === "running") {
          setBusy(true);
        } else if (manual || st.stale) {
          const r = await fetch("/api/orders", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ quips: true, key: epicKey }),
          });
          if (r.ok || r.status === 409) {
            setBusy(true);
          } else {
            fail("소감 생성 시작에 실패했습니다.");
            return;
          }
        } else {
          return; // 최신이면 아무것도 안 함
        }
        polls.current = 0;
        stopPoll();
        timer.current = setInterval(poll, 3000);
      } catch {
        setBusy(false);
        fail("소감 생성 시작 실패 — 네트워크를 확인해 주세요.");
      }
    },
    [epicKey, poll]
  );

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    start(false);
    return () => stopPoll();
  }, [start]);

  return (
    <Button
      type="link"
      size="small"
      icon={<MessageOutlined />}
      loading={busy}
      onClick={() => start(true)}
      style={{ padding: 0, height: "auto" }}
    >
      {busy ? "소감 생성 중…" : "소감 새로고침"}
    </Button>
  );
}

"use client";

import { useCanAct } from "@/components/CanAct";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Popover, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

/**
 * 아바타 소감(재미기능) 트리거 + 수동 새로고침 버튼.
 * 마운트 시 상태 확인 → 없음/오래됨이면 백그라운드 생성 시작(논블로킹), 폴링 후 완료되면 새로고침.
 * 수동(버튼) 실행이 실패하면 원인과 함께 에러 토스트를 띄운다. 자동 트리거 실패는 조용히 넘어간다.
 */
export default function QuipsControl({ epicKey }: { epicKey: string }) {
  const canAct = useCanAct();
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
        const targets: string[] = Array.isArray(st.staleSlugs) ? st.staleSlugs : [];
        if (st.jobState === "running") {
          setBusy(true);
        } else if (targets.length > 0) {
          // 소감 없음 + 추가 작업한 에이전트만 다시 생성(병합)
          const r = await fetch("/api/orders", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ quips: true, key: epicKey, slugs: targets }),
          });
          // 다른 작업이 실행 중이면 서버가 `busy:{잡키}`로 거절한다(소감은 최하위 우선순위).
          // 실패가 아니라 "양보"이므로 폴링하지 않고 조용히 물러난다. 다음 진입 때 다시 시도한다.
          if (r.status === 409) {
            const j = (await r.json().catch(() => null)) as { error?: string } | null;
            if (typeof j?.error === "string" && j.error.startsWith("busy")) {
              setBusy(false);
              if (manual) message.info("다른 작업이 실행 중이라 소감 생성을 건너뜁니다");
              return;
            }
          }
          if (r.ok || r.status === 409) {
            setBusy(true);
          } else {
            fail("소감 생성 시작에 실패했습니다.");
            return;
          }
        } else {
          if (manual) message.info("소감이 이미 최신이에요");
          return; // 다시 만들 대상 없음
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
    // 진입 즉시가 아니라 **브라우저가 한가해진 뒤**에 시작한다(최하위 우선순위).
    // 예전에는 마운트하자마자 API를 불러 화면이 뜨는 중에 서버 작업이 끼어들었다.
    // requestIdleCallback을 지원하지 않는 브라우저는 지연 타이머로 대체한다.
    const ric = typeof window !== "undefined" ? window.requestIdleCallback : undefined;
    let idleId: number | undefined;
    let timerId: number | undefined;
    if (ric) idleId = ric(() => start(false), { timeout: 5000 });
    else timerId = window.setTimeout(() => start(false), 2000);
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
      stopPoll();
    };
  }, [start]);

  if (!canAct) return null; // 읽기 전용 화면에는 리프레시 버튼을 그리지 않는다
  return (
    <Popover content={busy ? "소감 생성 중…" : "소감 리프레시"}>
      <Button
        type="text"
        size="small"
        icon={<ReloadOutlined />}
        loading={busy}
        onClick={() => start(true)}
        aria-label="소감 리프레시"
      />
    </Popover>
  );
}

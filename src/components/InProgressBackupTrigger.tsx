"use client";

import { useCallback, useEffect } from "react";
import { useCanAct } from "@/components/CanAct";

/**
 * 진행중(작업중) 메타 백업 트리거 — 화면에 아무것도 그리지 않는다.
 *
 * 대시보드를 열어 두면 하루 두 회차(오전 10시 이후·오후 3시 이후)가 채워지도록,
 * 자동 갱신과 같은 박자로 서버를 두드린다. 실제 판정·실행은 서버가 하고
 * (오늘 회차 파일이 있으면 즉시 반환), 여기서는 두드리기만 한다.
 *
 * AutoRefresh와 같은 규칙을 따른다: 탭이 화면에 없으면 건너뛰고, 다시 돌아오면 한 번 확인.
 * 실패는 조용히 넘어간다 — 백업이 화면 흐름을 막을 이유가 없다.
 */
export default function InProgressBackupTrigger({ intervalMs = 30000 }: { intervalMs?: number }) {
  const canAct = useCanAct();

  const check = useCallback(() => {
    // 이 맥이 아니면 서버가 403으로 막으므로 아예 부르지 않는다(원격 화면에서 소음 방지).
    if (!canAct) return;
    fetch("/api/backup/orchestration/inprogress", { method: "POST" }).catch(() => {
      /* 조용히 무시 */
    });
  }, [canAct]);

  useEffect(() => {
    if (!canAct) return;
    check();
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      check();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [canAct, check, intervalMs]);

  return null;
}

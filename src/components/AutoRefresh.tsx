"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SyncOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";

/**
 * 일정 주기로 현재 라우트의 서버 데이터를 다시 읽어온다.
 * router.refresh()는 전체 페이지 리로드 없이 서버 컴포넌트(파일 읽기)만 갱신한다.
 * 새로고침 아이콘을 누르면 주기와 무관하게 즉시 갱신한다.
 */
export default function AutoRefresh({
  intervalMs = 30000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  const [last, setLast] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  const refresh = useCallback(() => {
    router.refresh();
    setLast(new Date().toLocaleTimeString("ko-KR"));
    setSpinning(true);
    setTimeout(() => setSpinning(false), 600);
  }, [router]);

  useEffect(() => {
    setLast(new Date().toLocaleTimeString("ko-KR"));
    // 탭이 백그라운드(다른 탭·최소화)일 때는 갱신하지 않는다.
    // router.refresh()는 서버 컴포넌트를 전부 다시 실행하므로(파일 읽기·파싱) 보지 않는
    // 화면에 그 비용을 쓸 이유가 없다. 다시 화면으로 돌아오는 순간 한 번 갱신해 최신을 맞춘다.
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return (
    <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
      <Tooltip title="지금 갱신">
        <SyncOutlined
          spin={spinning}
          onClick={refresh}
          style={{ marginRight: 6, cursor: "pointer" }}
        />
      </Tooltip>
      {Math.round(intervalMs / 1000)}초마다 자동 갱신
      {last ? ` · 최근 ${last}` : ""}
    </span>
  );
}

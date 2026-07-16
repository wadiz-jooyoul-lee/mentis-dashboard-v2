"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Popconfirm, message } from "antd";
import { CheckCircleOutlined, UndoOutlined } from "@ant-design/icons";

/**
 * 목록 행별 해결 토글 버튼 — /dobby-resolve {키} [undo]를 백그라운드로 실행.
 * - 미해결(작업중): "해결 처리" → 상태를 "해결"로 표시.
 * - 해결됨/종료: "해결 취소" → 해결 표시를 되돌림(단계 → 통합, 비파괴).
 * 잡 결과를 잠깐 폴링해 실패(스킬 미설치 등)를 알린다.
 */
export default function ResolveButton({
  epicKey,
  resolved,
}: {
  epicKey: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const run = async (undo: boolean) => {
    setBusy(true);
    let res: { ok?: boolean; key?: string; error?: string } = {};
    try {
      res = await (
        await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resolve: true, key: epicKey, undo }),
        })
      ).json();
    } catch {
      /* ignore */
    }
    if (!res.ok || !res.key) {
      setBusy(false);
      message.error(
        res.error === "already_running" ? "이미 처리 중입니다." : "요청에 실패했습니다."
      );
      return;
    }
    const jobId = res.key;
    let tries = 0;
    stop();
    pollRef.current = setInterval(async () => {
      tries += 1;
      if (tries > 40) {
        stop();
        setBusy(false);
        message.info("아직 진행 중일 수 있어요 — 완료되면 자동 반영됩니다.");
        return;
      }
      let st: { state?: string; result?: string } = {};
      try {
        st = await (
          await fetch(`/api/orders?jobResult=${encodeURIComponent(jobId)}`, { cache: "no-store" })
        ).json();
      } catch {
        return;
      }
      if (st.state === "running") return;
      stop();
      setBusy(false);
      if (st.result && /unknown command|command not found|not found/i.test(st.result)) {
        message.error("dobby-resolve 스킬이 없어 실패했습니다. go-dobby 플러그인을 업데이트하세요.");
        return;
      }
      if (st.state === "failed") {
        message.error("처리에 실패했습니다 — 콘솔을 확인하세요.");
        return;
      }
      message.success(undo ? "해결 표시를 취소했습니다." : "해결로 표시했습니다.");
      router.refresh();
    }, 3000);
  };

  return (
    <Popconfirm
      title={resolved ? "해결 표시를 취소할까요?" : "이 오더를 해결로 표시할까요?"}
      okText={resolved ? "해결 취소" : "해결 처리"}
      cancelText="취소"
      onConfirm={() => run(resolved)}
    >
      <Button
        size="small"
        type={resolved ? "default" : "primary"}
        icon={resolved ? <UndoOutlined /> : <CheckCircleOutlined />}
        loading={busy}
        onClick={(e) => e.stopPropagation()}
      >
        {resolved ? "해결 취소" : "해결 처리"}
      </Button>
    </Popconfirm>
  );
}

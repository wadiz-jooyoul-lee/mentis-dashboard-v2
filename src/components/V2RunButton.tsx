"use client";

import { useCanAct } from "@/components/CanAct";
import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Tooltip, message } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";

type Check = { ok: boolean; reason?: string; running?: boolean; autoEnv?: string };

/**
 * "자동 실행" 버튼 — 설계가 확정된 /do 오더를 run.sh 로 통합까지 단계마다 새 세션으로 진행한다.
 * 자동 배포 환경이 적힌 오더는 통합 뒤 그 환경 배포와 검증까지 간다.
 * 시작 조건은 서버(v2RunCheck)가 판정하고, 맞지 않으면 버튼을 끄고 이유를 보여 준다.
 */
export default function V2RunButton({ epicKey }: { epicKey: string }) {
  const canAct = useCanAct();
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders?v2run=${encodeURIComponent(epicKey)}`, { cache: "no-store" });
      setCheck(await r.json());
    } catch {
      setCheck({ ok: false, reason: "조건을 확인하지 못했습니다" });
    }
  }, [epicKey]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    // 끝났을 때 맥 알림 센터로 알리기 위한 권한 — 사용자 클릭 안에서만 물을 수 있다.
    if (typeof Notification !== "undefined" && window.isSecureContext && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setBusy(true);
    let res: { ok?: boolean; error?: string } = {};
    try {
      res = await (
        await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ v2run: true, key: epicKey }),
        })
      ).json();
    } catch {
      /* ignore */
    }
    setBusy(false);
    if (res.ok) message.success("자동 실행을 시작했습니다. 콘솔 탭에서 진행을 볼 수 있습니다.");
    else message.error(res.error === "already_running" ? "이미 실행 중입니다." : res.error || "요청에 실패했습니다.");
    load();
  };

  // 다른 기기에서 열람 중이면 실행 버튼을 그리지 않는다(서버 가드는 별도).
  if (!canAct) return null;
  const disabled = !check?.ok;
  const button = (
    <Button type="link" icon={<PlayCircleOutlined />} disabled={disabled} loading={busy}>
      {check?.running ? "자동 실행 중" : "자동 실행"}
    </Button>
  );
  if (disabled) {
    return (
      <Tooltip title={check?.reason ?? "조건을 확인하는 중입니다"}>
        <span>{button}</span>
      </Tooltip>
    );
  }
  return (
    <Popconfirm
      title={check?.autoEnv ? `${check.autoEnv} 배포와 검증까지 자동으로 진행할까요?` : "통합까지 자동으로 진행할까요?"}
      description={
        check?.autoEnv
          ? `단계마다 새 세션을 띄워 남은 구현, 리뷰, 통합을 하고 ${check.autoEnv} 에 배포한 뒤 검증합니다. 커밋, 푸시, 머지, 빌드, 배포도 확인 없이 진행됩니다.`
          : "단계마다 새 세션을 띄워 구현, 리뷰, 수정, 통합을 진행합니다. 커밋과 푸시도 확인 없이 진행됩니다."
      }
      okText="자동 실행"
      cancelText="취소"
      onConfirm={run}
    >
      {button}
    </Popconfirm>
  );
}

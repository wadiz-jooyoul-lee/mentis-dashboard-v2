"use client";

import { useEffect, useState } from "react";
import { Switch, Tooltip } from "antd";
import { GlobalOutlined, LockOutlined } from "@ant-design/icons";

type State = { on: boolean; canToggle: boolean; host: string | null };

/**
 * 헤더의 "외부 공개" 토글. 켜면 같은 네트워크의 다른 기기에서도 대시보드가 열린다.
 *
 * 서버는 항상 열려 있고 `src/proxy.ts`가 이 값을 보고 막으므로, 재기동 없이 즉시 바뀐다.
 * 다른 기기에서 볼 때는 스위치가 잠긴다(끄고 켜는 건 이 맥에서만).
 */
export default function LanToggle() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/lan")
      .then((r) => r.json())
      .then(setS)
      .catch(() => setS(null));
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/lan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: next }),
      });
      if (r.ok) setS(await r.json());
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;

  const tip = !s.canToggle
    ? "공개 여부는 대시보드가 실행 중인 맥에서만 바꿀 수 있습니다."
    : s.on
      ? s.host
        ? `다른 기기에서 접속 가능: http://${s.host}:${location.port || 7253}`
        : "같은 네트워크의 다른 기기에서 접속 가능합니다."
      : "이 맥에서만 열립니다. 켜면 같은 네트워크의 다른 기기에서도 열립니다.";

  return (
    <Tooltip title={tip}>
      <span
        style={{
          color: s.on ? "#ffc53d" : "rgba(255,255,255,0.85)",
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {s.on ? <GlobalOutlined /> : <LockOutlined />}
        외부 공개
        <Switch
          checked={s.on}
          loading={busy}
          disabled={!s.canToggle}
          onChange={toggle}
          // antd 기본 꺼짐 색(rgba(0,0,0,0.25))은 검은 헤더 위에서 묻혀 버튼이 안 보인다.
          // 헤더 배경(#001529)과 대비되는 밝은 회색으로 직접 지정하고, 켜짐은 경고 성격이라 주황으로.
          style={{
            background: s.on ? "#fa8c16" : "rgba(255,255,255,0.45)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.5)",
          }}
        />
      </span>
    </Tooltip>
  );
}

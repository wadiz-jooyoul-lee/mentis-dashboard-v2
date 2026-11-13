"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Popconfirm, Space, Tag, message } from "antd";
import { CaretRightOutlined, DeleteOutlined, ReloadOutlined, StepForwardOutlined } from "@ant-design/icons";

type DemoState = { step: number; total: number; label: string };

/**
 * 헤더 데모 컨트롤 — 데모 모드(메타 루트 = .demo-meta)일 때만 레이아웃이 끼워 넣는다.
 * 어느 페이지에서든 ⏭ 로 시나리오를 한 단계씩 넘긴다(발표 동선이 안 끊기게 헤더에 둔다).
 */
export default function DemoControls() {
  const router = useRouter();
  const [state, setState] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/demo", { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.demo) setState(j.state as DemoState);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = useCallback(
    async (action: "start" | "next" | "reset" | "clean") => {
      setBusy(true);
      const r = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      }).catch(() => null);
      const j = await r?.json().catch(() => null);
      setBusy(false);
      if (!j?.ok) return void message.error(j?.error ?? "실패");
      setState((j.state as DemoState) ?? null);
      message.success(j.message ?? action);
      router.refresh(); // 화면이 5초 갱신을 기다리지 않고 바로 따라오게
    },
    [router]
  );

  const started = (state?.step ?? -1) >= 0;
  const stepText = started ? `${state!.step}/${state!.total} · ${state!.label}` : "시작 전";

  // 헤더에 넣으면 메뉴·새로고침 버튼을 가려서, 헤더 바로 아래(새로고침 버튼 밑)에 띄운다.
  return (
    <div
      style={{
        position: "fixed",
        top: 72, // antd Header 높이 64 + 여백
        right: 16,
        zIndex: 99, // 헤더(100)보다 아래, 본문 위
        background: "rgba(255, 255, 255, 0.95)",
        border: "1px solid #d3adf7",
        borderRadius: 8,
        padding: "6px 10px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      }}
    >
    <Space size={6}>
      <Tag color="purple" style={{ marginRight: 0 }}>
        데모 {stepText}
      </Tag>
      {!started || state!.step >= state!.total ? (
        <Button size="small" type="primary" icon={<CaretRightOutlined />} loading={busy} onClick={() => act("start")}>
          시작
        </Button>
      ) : (
        <Button size="small" type="primary" icon={<StepForwardOutlined />} loading={busy} onClick={() => act("next")}>
          다음
        </Button>
      )}
      <Button size="small" icon={<ReloadOutlined />} disabled={busy} onClick={() => act("reset")} title="처음부터" />
      <Popconfirm title="데모 데이터(.demo-meta)를 삭제할까요?" okText="삭제" cancelText="취소" onConfirm={() => act("clean")}>
        <Button size="small" danger icon={<DeleteOutlined />} disabled={busy} title="데모 데이터 삭제" />
      </Popconfirm>
    </Space>
    </div>
  );
}

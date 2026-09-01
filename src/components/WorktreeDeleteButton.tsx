"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Popconfirm, Tooltip, message } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { useCanAct } from "@/components/CanAct";

/**
 * 워크트리 삭제 버튼(목록의 "해결" 옆 작은 빨간 ✕).
 *
 * dobby-end와 같은 일을 한다 — 제거 전 코드 변경을 `code-changes/`에 남기고 **브랜치는 보존**하며,
 * 메타 폴더는 건드리지 않는다. 그래서 지운 뒤에도 "이어가기"의 복구 명령으로 되살릴 수 있다.
 *
 * 삭제 가능 여부(`state`)는 **서버가 목록을 그릴 때 미리 판정해** 내려준다. 예전에는 마우스를
 * 올렸을 때 조회했는데, 버튼이 활성(빨강)으로 그려졌다가 커서 아래에서 비활성(회색)으로 바뀌었다.
 * 지울 워크트리가 아예 없는 오더는 호출부가 이 컴포넌트를 그리지 않는다.
 */
export default function WorktreeDeleteButton({
  epicKey,
  state,
}: {
  epicKey: string;
  state: { removable: boolean; reason: string | null };
}) {
  const canAct = useCanAct();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!canAct) return null;

  const del = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: epicKey, worktreeDelete: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        // 스냅샷 결과를 그대로 알린다 — "기록 남김"과 "남길 변경이 없었음", "실패"는 뜻이 다르다.
        const snap: { repo: string; state: string }[] = d?.snapshot ?? [];
        const failed = snap.filter((x) => x.state === "failed").map((x) => x.repo);
        const saved = snap.filter((x) => x.state === "saved").length;
        if (failed.length > 0) {
          message.warning(
            `워크트리를 삭제했습니다. 다만 ${failed.join(", ")}의 변경 기록을 남기지 못했습니다(브랜치는 보존되어 복원 가능).`
          );
        } else if (saved > 0) {
          message.success("워크트리를 삭제했습니다 (변경 내용은 기록으로 남고 브랜치도 보존)");
        } else {
          message.success("워크트리를 삭제했습니다 (남길 변경이 없었습니다 · 브랜치는 보존)");
        }
        router.refresh();
      } else {
        message.error(d?.error ?? "삭제 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  const disabled = !state.removable;
  const tip = disabled
    ? `워크트리를 삭제할 수 없습니다 — ${state.reason}`
    : "작업 폴더(워크트리)를 삭제합니다. 삭제 전 코드 변경을 기록으로 남기고 브랜치는 보존하므로, 나중에 '이어가기'의 복구 명령으로 되살릴 수 있습니다.";

  const btn = (
    <Button
      type="text"
      size="small"
      danger
      icon={<CloseOutlined />}
      loading={busy}
      disabled={disabled}
      // 비활성 버튼은 마우스 이벤트를 삼켜 래퍼 span까지 닿지 않아 툴팁이 안 뜬다.
      // pointer-events를 꺼서 히트 테스트가 span으로 넘어가게 한다(antd 표준 우회).
      style={disabled ? { pointerEvents: "none" } : undefined}
      aria-label="워크트리 삭제"
    />
  );

  return (
    <Tooltip title={tip}>
      <span style={{ display: "inline-flex", cursor: disabled ? "not-allowed" : undefined }}>
        {disabled ? (
          btn
        ) : (
          <Popconfirm
            title="워크트리를 삭제할까요?"
            description="코드 변경은 기록으로 남고 브랜치는 보존됩니다."
            okText="삭제"
            okButtonProps={{ danger: true }}
            cancelText="취소"
            onConfirm={del}
          >
            {btn}
          </Popconfirm>
        )}
      </span>
    </Tooltip>
  );
}

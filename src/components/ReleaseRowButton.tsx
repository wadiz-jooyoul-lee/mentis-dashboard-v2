"use client";

import { useState } from "react";
import { Button, Tooltip, message } from "antd";
import { TableOutlined, CheckOutlined } from "@ant-design/icons";
import { copyHtml } from "@/lib/clipboard";
import type { ReleaseRow } from "@/lib/releaseRow";

/**
 * Confluence 릴리즈 노트 표에 붙여넣을 한 줄을 클립보드에 담는다.
 *
 * 번들 판정에 1.5초쯤 들어 **누른 뒤에** 만든다. 화면을 열 때 미리 만들면 이 버튼을
 * 안 쓰는 사람까지 느려진다.
 */
export default function ReleaseRowButton({ epicKey }: { epicKey: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${epicKey}/release-row`);
      if (!res.ok) {
        message.error("줄을 만들지 못했습니다.");
        return;
      }
      const data: { row: ReleaseRow; html: string; text: string } = await res.json();
      if (!(await copyHtml(data.html, data.text))) {
        message.error("복사에 실패했습니다.");
        return;
      }
      // 채운 값을 보여 준다. 빈 칸이 있으면 **붙이기 전에** 알아채야 하므로 따로 짚어 준다 —
      // 붙인 뒤 표에서 빈칸을 찾는 것보다 여기서 아는 편이 낫다.
      const r = data.row;
      const filled = [r.service, r.kind, r.env, r.verdict].filter(Boolean).join(" · ");
      const blanks = [
        ["서비스", r.service],
        ["기능", r.kind],
        ["담당자", r.owner],
        ["검증 환경", r.env],
        ["검증 결과", r.verdict],
      ]
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (blanks.length) {
        message.warning(`릴리즈 노트 줄 복사 — ${blanks.join("·")} 은(는) 비어 있습니다`);
      } else {
        message.success(`릴리즈 노트 줄 복사 — ${filled}`);
      }
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      message.error("줄을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip title="Confluence 릴리즈 노트 표에 붙여넣을 한 줄을 복사합니다 (번호·배포확인 칸은 비어 있습니다)">
      <Button
        type="link"
        aria-label="릴리즈 노트 줄 복사"
        loading={busy}
        icon={done ? <CheckOutlined style={{ color: "#52c41a" }} /> : <TableOutlined />}
        onClick={onClick}
      >
        릴리즈 노트 줄
      </Button>
    </Tooltip>
  );
}

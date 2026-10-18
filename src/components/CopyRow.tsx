"use client";

import { Button, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { copyText } from "@/lib/clipboard";

/** 모노스페이스 값 한 줄 + 복사 버튼. */
export function CopyRow({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    const ok = await copyText(value);
    if (ok) message.success(`${label} 복사됨`);
    else message.error("복사 실패 — 값을 직접 선택해 복사하세요");
  };
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
      <div
        style={{
          flex: 1,
          fontSize: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          wordBreak: "break-all",
          userSelect: "all",
          background: "#f5f5f5",
          borderRadius: 4,
          padding: "4px 8px",
        }}
      >
        {value}
      </div>
      <Button size="small" icon={<CopyOutlined />} onClick={copy} style={{ flexShrink: 0 }}>
        복사
      </Button>
    </div>
  );
}

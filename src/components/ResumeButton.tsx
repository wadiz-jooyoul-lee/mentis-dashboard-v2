"use client";

import { useState } from "react";
import { Button, Popover, Space, Typography, message, Empty, Spin, Alert } from "antd";
import { PlayCircleOutlined, CopyOutlined } from "@ant-design/icons";

const { Text } = Typography;

/** 클립보드 복사 — 보안 컨텍스트가 아니면(예: http://IP) navigator.clipboard가 없으므로 execCommand로 폴백. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 폴백으로 진행 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type Session = { sessionId: string | null; cwd: string | null };

/** 모노스페이스 값 한 줄 + 복사 버튼. */
function CopyRow({ label, value }: { label: string; value: string }) {
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

/**
 * "이어가기" 버튼 — 오더 status.md의 세션 ID·작업 경로로
 * `cd <경로> && claude --resume <세션ID>` 명령을 만들어 복사해 준다.
 * 용도: 터미널에서 돌리던 mode=A 세션을 닫은 뒤, 한참 후 그 폴더·세션으로 정확히 복귀.
 * (라이브 attach가 아니라 저장된 세션 전사에서 이어가는 것.)
 */
export default function ResumeButton({ epicKey }: { epicKey: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/orders?session=${encodeURIComponent(epicKey)}`, {
        cache: "no-store",
      });
      const j = await r.json();
      setData({ sessionId: j.sessionId ?? null, cwd: j.cwd ?? null });
    } catch {
      setData({ sessionId: null, cwd: null });
    }
    setLoading(false);
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && data === null) load();
  };

  const content = (
    <div style={{ width: 460, maxWidth: "82vw" }}>
      {loading || !data ? (
        <Spin size="small" />
      ) : !data.sessionId && !data.cwd ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="세션 정보가 없습니다 (status.md에 ## 세션 미기록)"
        />
      ) : (
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          {data.sessionId && data.cwd ? (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>
                이 명령을 터미널에 붙여넣어 세션을 이어가세요:
              </Text>
              <CopyRow
                label="명령"
                value={`cd ${data.cwd} && claude --resume ${data.sessionId}`}
              />
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ fontSize: 12 }}
              message={
                data.cwd
                  ? "세션 ID가 기록되지 않았습니다. 아래 폴더로 이동 후 `claude --resume` 목록에서 고르세요."
                  : "작업 경로가 기록되지 않았습니다. 세션 ID로 `claude --resume` 하세요."
              }
            />
          )}
          {data.cwd && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                작업 경로
              </Text>
              <CopyRow label="작업 경로" value={data.cwd} />
            </div>
          )}
          {data.sessionId && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                세션 ID
              </Text>
              <CopyRow label="세션 ID" value={data.sessionId} />
            </div>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>
            * 라이브 접속이 아니라 저장된 세션 전사에서 이어갑니다. 터미널을 닫았어도 그 폴더에서 이 명령으로 복귀됩니다.
          </Text>
        </Space>
      )}
    </div>
  );

  return (
    <Popover
      title="세션 이어가기 (claude --resume)"
      trigger="click"
      open={open}
      onOpenChange={onOpenChange}
      content={content}
      placement="bottomRight"
    >
      <Button type="link" icon={<PlayCircleOutlined />}>
        이어가기
      </Button>
    </Popover>
  );
}

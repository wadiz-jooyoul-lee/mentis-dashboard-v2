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

/**
 * 워크트리 복원 + 세션 이어가기를 **한 줄로** 잇는다(붙여넣기 한 번으로 끝).
 *
 * 각 저장소 단위는 실측한 실패 조건을 피하도록 만든다(git 2.52 기준):
 *  - `worktree prune`: 폴더만 `rm`으로 지운 경우 "missing but already registered"로 add가 실패한다.
 *    prune은 사라진 워크트리의 관리 기록만 지우므로 안전하다.
 *  - `[ -d 경로 ] ||`: 이미 있으면 건너뛴다(add는 "already exists"로 실패해 체인이 끊긴다).
 *  - 브랜치가 원격에만 있어도 add가 추적 브랜치를 자동 생성한다(실측 확인).
 *  - `&&`로 이어 **하나라도 실패하면 claude를 띄우지 않는다**(코드 없이 세션만 열리는 것 방지).
 */
function chainedCommand(d: { cwd: string | null; sessionId: string | null; restore: Restore[] }): string {
  const q = (v: string) => `"${v}"`;
  const parts = d.restore.map(
    (r) =>
      `(git -C ${q(r.srcRepo)} worktree prune; [ -d ${q(r.worktreePath)} ] || git -C ${q(r.srcRepo)} worktree add ${q(r.worktreePath)} ${r.branch})`
  );
  parts.push(`cd ${q(d.cwd ?? "")}`);
  parts.push(`claude --resume ${d.sessionId}`);
  return parts.join(" && ");
}

type Restore = { repo: string; branch: string; worktreePath: string; srcRepo: string };
type Session = {
  sessionId: string | null;
  cwd: string | null;
  cwdExists: boolean;
  /** 사라진 워크트리들(멀티 repo면 여러 개). 비어 있으면 코드 폴더가 다 살아 있다는 뜻. */
  restore: Restore[];
};

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
      setData({
        sessionId: j.sessionId ?? null,
        cwd: j.cwd ?? null,
        cwdExists: !!j.cwdExists,
        restore: Array.isArray(j.restore) ? j.restore : [],
      });
    } catch {
      setData({ sessionId: null, cwd: null, cwdExists: false, restore: [] });
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
                {data.restore.length > 0
                  ? "이 명령 하나로 코드 폴더를 되살린 뒤 세션까지 이어집니다:"
                  : data.cwdExists
                    ? "이 명령을 터미널에 붙여넣어 세션을 이어가세요:"
                    : "작업 경로가 사라졌습니다. 아래 명령이 폴더를 되살린 뒤 세션을 이어갑니다:"}
              </Text>
              <CopyRow
                label="명령"
                value={
                  data.restore.length > 0
                    ? chainedCommand(data)
                    : data.cwdExists
                      ? `cd ${data.cwd} && claude --resume ${data.sessionId}`
                      : `mkdir -p ${data.cwd} && cd ${data.cwd} && claude --resume ${data.sessionId}`
                }
              />
              {/* 세션의 작업 경로는 보통 오케스트레이터가 돌던 폴더(원본 저장소)라 살아 있다.
                  진짜 사라지는 건 에이전트 워크트리이므로, 그건 따로 복원 명령을 준다. */}
              {data.restore.length > 0 && (
                <>
                  <Alert
                    type="warning"
                    showIcon
                    style={{ fontSize: 12 }}
                    title={`이 오더의 코드 폴더(워크트리) ${data.restore.length}개가 정리되어, 위 명령이 먼저 되살린 뒤 세션을 엽니다. 브랜치는 보존되어 있어 복원됩니다. 복원에 실패하면 세션을 열지 않고 멈춥니다.`}
                  />
                  {data.restore.map((r) => (
                    <div key={r.worktreePath}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        따로 실행하려면 · {r.repo} ({r.branch})
                      </Text>
                      <CopyRow
                        label="복원 명령"
                        value={`git -C ${r.srcRepo} worktree add ${r.worktreePath} ${r.branch}`}
                      />
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              style={{ fontSize: 12 }}
              title={
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

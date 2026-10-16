"use client";

import { useState } from "react";
import { Alert, Button, Empty, Popover, Space, Spin, Typography } from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";
import { CopyRow } from "@/components/CopyRow";

const { Text } = Typography;

type Restore = { repo: string; branch: string; worktreePath: string; srcRepo: string };
type Session = {
  sessionName: string | null;
  restore: Restore[];
  worktrees: { repo: string; branch: string; path: string }[];
  isV2: boolean;
};

/** 저장소 하나의 행 — 워크트리 경로·브랜치와, 그 워크트리를 되살려야 하는지. */
type Target = { repo: string; branch: string; path: string; restoreFrom: string | null };

const q = (v: string) => `"${v}"`;

/**
 * 워크트리로 이동해 **새 세션**을 여는 명령. 옛 대화를 불러오지 않는다(`--resume` 을 쓰지 않는다).
 * v2 오더면 첫 지시로 `/do {키}` 를 넘겨 메타 문서를 읽고 다음 단계를 이어가게 한다.
 * 사라진 워크트리는 먼저 되살리고(prune → 없을 때만 add), 실패하면
 * `&&` 에서 끊겨 claude 를 띄우지 않는다.
 */
function commandFor(t: Target, epicKey: string, isV2: boolean): string {
  const parts: string[] = [];
  if (t.restoreFrom) parts.push(restoreStep(t, t.restoreFrom));
  parts.push(`cd ${q(t.path)}`);
  parts.push(isV2 ? `claude ${q(`/do ${epicKey}`)}` : "claude");
  return parts.join(" && ");
}

function restoreStep(t: Target, from: string): string {
  return `(git -C ${q(from)} worktree prune; [ -d ${q(t.path)} ] || git -C ${q(from)} worktree add ${q(t.path)} ${t.branch})`;
}

/**
 * "이어가기 v2" 버튼 — 코드가 있는 워크트리로 이동해 새 세션을 여는 명령을 복사해 준다.
 * 옛 대화를 `claude --resume` 으로 다시 불러오면 호출마다 비싸다. v2 오더는 단계마다 새 세션이
 * 메타 문서만 읽고 이어가므로 옛 대화가 필요 없다.
 */
export default function ResumeV2Button({ epicKey }: { epicKey: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/orders?session=${encodeURIComponent(epicKey)}`, { cache: "no-store" });
      const j = await r.json();
      setData({
        sessionName: j.sessionName ?? null,
        restore: Array.isArray(j.restore) ? j.restore : [],
        worktrees: Array.isArray(j.worktrees) ? j.worktrees : [],
        isV2: !!j.isV2,
      });
    } catch {
      setData({ sessionName: null, restore: [], worktrees: [], isV2: false });
    }
    setLoading(false);
  };

  // 누를 때마다 다시 읽는다 — 단계가 끝나 세션이 바뀌었을 수 있다.
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) load();
  };

  const targets: Target[] = data
    ? [
        ...data.worktrees.map((w) => ({ ...w, restoreFrom: null })),
        ...data.restore.map((r) => ({ repo: r.repo, branch: r.branch, path: r.worktreePath, restoreFrom: r.srcRepo })),
      ]
    : [];

  const content = (
    <div style={{ width: 480, maxWidth: "82vw" }}>
      {loading || !data ? (
        <Spin size="small" />
      ) : (
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          {data.sessionName && (
            <Alert
              type="warning"
              showIcon
              style={{ fontSize: 12 }}
              title={`이 오더의 세션이 지금 떠 있습니다 — ${data.sessionName}. 새 세션을 함께 열면 두 세션이 같은 메타 문서를 동시에 고칩니다. 그 세션을 닫은 뒤 여세요.`}
            />
          )}
          {!data.isV2 && (
            <Alert
              type="info"
              showIcon
              style={{ fontSize: 12 }}
              title="/do 로 진행한 오더가 아닙니다. 워크트리로 이동해 빈 새 세션만 엽니다. 무엇을 할지는 직접 입력하세요."
            />
          )}
          {targets.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="워크트리 기록이 없습니다 (status.md ## 워크트리 / 브랜치 미기록)"
            />
          ) : (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {data.isV2
                  ? "코드가 있는 워크트리에서 새 세션을 열어 다음 단계를 이어갑니다. 터미널에 붙여넣으세요:"
                  : "코드가 있는 워크트리로 이동해 새 세션을 엽니다. 터미널에 붙여넣으세요:"}
              </Text>
              {targets.map((t) => (
                <div key={t.path}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {t.repo} ({t.branch}){t.restoreFrom && " · 워크트리가 정리되어 먼저 되살립니다"}
                  </Text>
                  <CopyRow label="명령" value={commandFor(t, epicKey, data.isV2)} />
                </div>
              ))}
            </>
          )}
        </Space>
      )}
    </div>
  );

  return (
    <Popover
      title="워크트리에서 이어가기 (새 세션)"
      trigger="click"
      open={open}
      onOpenChange={onOpenChange}
      content={content}
      placement="bottomRight"
    >
      <Button type="link" icon={<FolderOpenOutlined />}>
        이어가기 v2
      </Button>
    </Popover>
  );
}

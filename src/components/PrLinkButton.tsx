"use client";

import { useState } from "react";
import { Button, Popover, Input, Space, Typography, message, Empty, Spin } from "antd";
import { BranchesOutlined } from "@ant-design/icons";

const { Text } = Typography;

type Target = { repo: string; branch: string; repoUrl: string | null };

/**
 * "Jira에서 열기" 옆 버튼 — 병합 대상(base) 브랜치를 입력하면,
 * 이 오더의 개발 브랜치를 그 브랜치로 머지하는 GitHub PR 생성 링크를 repo별로 만들어 준다.
 * URL은 표시만 하고, 클릭하면 클립보드에 복사한다(새 탭 자동 열기 없음).
 * 대상 브랜치·repo·GitHub 주소는 서버(?prTargets)에서 받아온다.
 */
export default function PrLinkButton({ epicKey }: { epicKey: string }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/orders?prTargets=${encodeURIComponent(epicKey)}`, {
        cache: "no-store",
      });
      const j = await r.json();
      setTargets(Array.isArray(j.targets) ? j.targets : []);
    } catch {
      setTargets([]);
    }
    setLoading(false);
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && targets === null) load();
  };

  const prUrl = (t: Target): string | null =>
    t.repoUrl && base.trim()
      ? `${t.repoUrl}/compare/${encodeURIComponent(base.trim())}...${t.branch}?expand=1`
      : null;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success("PR 링크를 복사했습니다.");
    } catch {
      message.error("복사에 실패했습니다 — 링크를 직접 선택해 복사하세요.");
    }
  };

  const content = (
    <div style={{ width: 480, maxWidth: "82vw" }}>
      <Input
        placeholder="병합 대상(base) 브랜치 — 예: RC, develop"
        value={base}
        onChange={(e) => setBase(e.target.value)}
        allowClear
        autoFocus
      />
      <div style={{ marginTop: 10 }}>
        {loading ? (
          <Spin size="small" />
        ) : !targets || targets.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="이 오더의 브랜치 정보를 찾을 수 없습니다"
          />
        ) : (
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {targets.map((t, i) => {
              const url = prUrl(t);
              return (
                <div key={`${t.repo}-${t.branch}-${i}`}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.repo || "repo?"} · <Text code>{t.branch}</Text> →{" "}
                    <Text code>{base.trim() || "(base 입력)"}</Text>
                  </Text>
                  {!t.repoUrl ? (
                    <div>
                      <Text type="danger" style={{ fontSize: 12 }}>
                        GitHub 주소를 확인할 수 없습니다 ({t.repo || "repo 미상"})
                      </Text>
                    </div>
                  ) : !base.trim() ? (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        병합 대상 브랜치를 입력하면 링크가 생성됩니다.
                      </Text>
                    </div>
                  ) : (
                    <div
                      onClick={() => copy(url!)}
                      title="클릭하면 복사"
                      style={{
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        wordBreak: "break-all",
                        background: "#f5f5f5",
                        borderRadius: 4,
                        padding: "4px 8px",
                        marginTop: 2,
                      }}
                    >
                      {url}
                    </div>
                  )}
                </div>
              );
            })}
          </Space>
        )}
      </div>
    </div>
  );

  return (
    <Popover
      title="PR 생성 링크 (개발 브랜치 → 입력한 base로 머지)"
      trigger="click"
      open={open}
      onOpenChange={onOpenChange}
      content={content}
      placement="bottomRight"
    >
      <Button type="link" icon={<BranchesOutlined />}>
        PR 링크
      </Button>
    </Popover>
  );
}

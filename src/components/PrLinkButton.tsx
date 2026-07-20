"use client";

import { useState } from "react";
import { Button, Popover, Input, Space, Typography, message, Empty, Spin } from "antd";
import { BranchesOutlined, CopyOutlined, ExportOutlined } from "@ant-design/icons";

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
    const ok = await copyText(url);
    if (ok) message.success("PR 링크를 복사했습니다.");
    else message.error("복사에 실패했습니다 — 링크를 직접 선택해 복사하세요.");
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
                    <div style={{ display: "flex", alignItems: "stretch", gap: 6, marginTop: 2 }}>
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
                        {url}
                      </div>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copy(url!)}
                        style={{ flexShrink: 0 }}
                      >
                        복사
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        icon={<ExportOutlined />}
                        onClick={() => window.open(url!, "_blank", "noopener,noreferrer")}
                        style={{ flexShrink: 0 }}
                      >
                        열기
                      </Button>
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

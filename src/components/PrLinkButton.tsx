"use client";

import { useState } from "react";
import { Button, Popover, Input, Space, Typography, message, Empty, Spin, Divider, Tooltip, Tag } from "antd";
import { BranchesOutlined, CopyOutlined, ExportOutlined } from "@ant-design/icons";
import { copyText } from "@/lib/clipboard";
import { envBranchesOf, type ExistingPr } from "@/lib/prEnv";

const { Text } = Typography;

type Target = { repo: string; branch: string; repoUrl: string | null };

/**
 * "Jira" 옆 버튼 — 병합 대상(base) 브랜치를 입력하면,
 * 이 오더의 개발 브랜치를 그 브랜치로 머지하는 GitHub PR 생성 링크를 repo별로 만들어 준다.
 * 아래에는 환경 브랜치(dev·rc1·rc4·stage 등)로 가는 링크를 입력 없이 미리 만들어 두고,
 * 그 환경으로 이미 만들어진 PR(열림·머지됨)도 함께 보여 준다(?prExisting, 창을 열 때마다 조회).
 * 대상 브랜치·repo·GitHub 주소는 서버(?prTargets)에서 받아온다.
 */
export default function PrLinkButton({ epicKey }: { epicKey: string }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [prs, setPrs] = useState<Record<string, ExistingPr[]> | null>(null);

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

  const loadPrs = async () => {
    setPrs(null);
    try {
      const r = await fetch(`/api/orders?prExisting=${encodeURIComponent(epicKey)}`, {
        cache: "no-store",
      });
      const j = await r.json();
      setPrs(j.prs && typeof j.prs === "object" ? j.prs : {});
    } catch {
      setPrs({});
    }
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && targets === null) load();
    if (o) loadPrs();
  };

  const linkButtons = (url: string) => (
    <>
      <Tooltip title={url}>
        <Button size="small" icon={<CopyOutlined />} onClick={() => copy(url)}>
          복사
        </Button>
      </Tooltip>
      <Button
        size="small"
        type="primary"
        icon={<ExportOutlined />}
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      >
        열기
      </Button>
    </>
  );

  const compareUrl = (t: Target, b: string): string | null =>
    t.repoUrl && b ? `${t.repoUrl}/compare/${encodeURIComponent(b)}...${t.branch}?expand=1` : null;
  const prUrl = (t: Target) => compareUrl(t, base.trim());

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
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
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
      {targets && targets.some((t) => t.repoUrl) && (
        <>
          <Divider plain style={{ margin: "12px 0 8px", fontSize: 12 }}>
            환경별 PR {prs === null && <Spin size="small" style={{ marginLeft: 6 }} />}
          </Divider>
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            {targets
              .filter((t) => t.repoUrl)
              .map((t, i) => (
                <div key={`env-${t.repo}-${t.branch}-${i}`}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.repo || "repo?"} · <Text code>{t.branch}</Text>
                  </Text>
                  {envBranchesOf(t.repo).map((b) => (
                    <div key={b}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <Text style={{ flex: 1, fontSize: 12 }}>
                          → <Text code>{b}</Text>
                        </Text>
                        {linkButtons(compareUrl(t, b)!)}
                      </div>
                      {(prs?.[`${t.repo}|${t.branch}`] ?? [])
                        .filter((p) => p.base === b)
                        .map((p) => (
                          <div
                            key={p.number}
                            style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingLeft: 18 }}
                          >
                            <Text style={{ flex: 1, fontSize: 12 }}>
                              #{p.number}{" "}
                              <Tag color={p.state === "OPEN" ? "green" : "purple"} style={{ marginInline: 4 }}>
                                {p.state === "OPEN" ? "열림" : "머지됨"}
                              </Tag>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {p.head}
                              </Text>
                            </Text>
                            {linkButtons(p.url)}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              ))}
          </Space>
        </>
      )}
    </div>
  );

  return (
    <Popover
      title="PR 생성 링크 (개발 브랜치 → base로 머지)"
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

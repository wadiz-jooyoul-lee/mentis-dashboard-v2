"use client";

import { useEffect, useState } from "react";
import { Typography, Space, Button, Card, Tag, Alert, message } from "antd";
import { CopyOutlined, ExportOutlined } from "@ant-design/icons";
import OrderHeader from "@/components/OrderHeader";

const { Title, Text, Paragraph } = Typography;

/** http://IP(비보안 컨텍스트)에선 navigator.clipboard가 없으므로 execCommand로 폴백. */
async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    message.success("링크를 복사했습니다.");
  } catch {
    message.error("복사에 실패했습니다.");
  }
}

/** 링크 한 줄 + 복사/열기 버튼. */
function LinkRow({ url }: { url: string }) {
  return (
    <Space.Compact style={{ width: "100%" }}>
      <Button style={{ flex: 1, textAlign: "left", cursor: "text", overflow: "hidden" }} title={url}>
        <Text ellipsis style={{ maxWidth: "100%" }}>
          {url}
        </Text>
      </Button>
      <Button icon={<CopyOutlined />} onClick={() => copyText(url)}>
        복사
      </Button>
      <Button
        type="primary"
        icon={<ExportOutlined />}
        onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
      >
        열기
      </Button>
    </Space.Compact>
  );
}

export default function ArtifactTabView({
  epicKey,
  hasExplainer,
  shareUrl,
  mode,
  worktreeRemoved,
  hasJira,
}: {
  epicKey: string;
  hasExplainer: boolean;
  shareUrl: string | null;
  mode: string | null;
  worktreeRemoved: boolean;
  hasJira: boolean;
}) {
  // window.location.origin은 클라이언트에서만 — hydration 불일치 방지 위해 mount 후 설정.
  const [origin, setOrigin] = useState<string>("");
  useEffect(() => setOrigin(window.location.origin), []);
  const localUrl = origin ? `${origin}/api/orders/artifact-html?key=${encodeURIComponent(epicKey)}` : "";

  return (
    <div>
      <OrderHeader
        epicKey={epicKey}
        mode={mode}
        worktreeRemoved={worktreeRemoved}
        hasJira={hasJira}
      />

      <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ① 로컬 HTML — 구현 내용(explainer)을 크롬 없는 HTML로 */}
        <Card size="small" title={<Space><span>구현 내용 HTML</span><Tag color="blue">로컬</Tag></Space>}>
          {hasExplainer ? (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                &lsquo;구현 내용&rsquo; 탭 내용을 그대로 담은 단독 HTML 페이지입니다(이 대시보드가 서빙).
              </Text>
              {localUrl && <LinkRow url={localUrl} />}
              {localUrl && (
                <iframe
                  title="구현 내용 미리보기"
                  src={localUrl}
                  style={{ width: "100%", height: 560, border: "1px solid #f0f0f0", borderRadius: 6 }}
                />
              )}
            </Space>
          ) : (
            <Alert
              type="info"
              showIcon
              message="아직 구현 내용(explainer)이 없습니다."
              description="‘구현 내용’ 탭에서 먼저 생성하면 여기에서 HTML 링크·미리보기가 제공됩니다."
            />
          )}
        </Card>

        {/* ② claude.ai 공개 아티팩트 — dobby-share가 생성한 링크(있으면) */}
        <Card
          size="small"
          title={<Space><span>공개 아티팩트</span><Tag color="purple">claude.ai</Tag></Space>}
        >
          {shareUrl ? (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                <code>/dobby-share {epicKey}</code> 로 게시된 공개 아티팩트 링크입니다.
              </Text>
              <LinkRow url={shareUrl} />
            </Space>
          ) : (
            <Alert
              type="info"
              showIcon
              message="공개 아티팩트 링크가 아직 없습니다."
              description={
                <Paragraph style={{ margin: 0 }}>
                  대화형 Claude Code에서 <Text code>/dobby-share {epicKey}</Text> 를 실행하면 claude.ai
                  공개 아티팩트가 생성되고, 그 링크가 여기에 복사·열기 버튼으로 나타납니다. (백그라운드 잡은
                  claude.ai 게시 권한이 없어 대화형 실행이 필요합니다.)
                </Paragraph>
              }
            />
          )}
        </Card>
      </div>
    </div>
  );
}

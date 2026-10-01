"use client";

import { useEffect, useRef, useState } from "react";
import { Typography, Space, Card, Empty, Tag, Anchor } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import OrderHeader from "@/components/OrderHeader";
import MarkdownDoc from "@/components/MarkdownDoc";
import type { OrderDoc } from "@/lib/orchestration";
import "./markdown.css";

const { Title, Text } = Typography;

/** 화면 맨 위 상단 바 높이(AppShell의 Header가 position:sticky·top 0으로 고정). */
const APP_HEADER_H = 64;

/** 고정된 목차와 그 아래 문서 사이에 두는 여백. 테두리까지 감안해 조금 넉넉히 둔다. */
const GAP = 16;

/**
 * 목차를 붙일 높이 = 상단 바 + 오더 머리띠.
 *
 * 머리띠가 둘이다 — 맨 위 상단 바(64px 고정)와 그 아래 오더 머리띠(`[data-order-header]`,
 * sticky top:64). 목차를 그냥 고정하면 antd 기본값이 `offsetTop: 0`이라 **두 머리띠 뒤로
 * 숨는다.** 오더 머리띠는 제목이 길면 줄이 늘어 높이가 달라지므로 상수로 박지 않고 실측한다.
 */
function useHeaderBottom(): number {
  const [bottom, setBottom] = useState(APP_HEADER_H);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-order-header]");
    if (!el) return;
    // offsetHeight 는 소수점을 버려 실제보다 2~4px 작게 나온다(실측: 149 vs 151).
    // 그만큼 목차가 머리띠 밑으로 물리므로 테두리까지 포함한 실제 높이를 올림해서 쓴다.
    const read = () => setBottom(APP_HEADER_H + Math.ceil(el.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return bottom;
}

/**
 * 전용 탭이 없는 루트 문서를 모아 보여 준다.
 *
 * 에이전트가 조사 결과를 임의 이름으로 남기면(`sweep-findings.md`·`analysis-{영역}.md` 등)
 * 대시보드가 그 이름을 몰라 **어느 화면에도 안 나왔다.** 이 화면이 그것을 받는다.
 * 보드는 목록만 보여 주고, 본문은 여기서만 읽는다.
 */
export default function OtherDocsView({
  epicKey,
  title = null,
  docs,
  mode = null,
  worktreeRemoved = false,
  resolved = false,
  hasJira = false,
  hasDesign = false,
  hasQa = false,
  orderKind = null,
}: {
  epicKey: string;
  title?: string | null;
  docs: OrderDoc[];
  mode?: string | null;
  worktreeRemoved?: boolean;
  resolved?: boolean;
  hasJira?: boolean;
  hasDesign?: boolean;
  hasQa?: boolean;
  orderKind?: "development" | "deliverable" | "summary" | null;
}) {
  const headerBottom = useHeaderBottom();
  // 목차 자체의 높이 — 문서를 누를 때 그 제목이 목차에 가리지 않게 내려 세우는 데 쓴다.
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorH, setAnchorH] = useState(0);
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const read = () => setAnchorH(el.offsetHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [docs.length]);

  const header = (
    <OrderHeader
      epicKey={epicKey}
      title={title}
      mode={mode}
      worktreeRemoved={worktreeRemoved}
      resolved={resolved}
      hasJira={hasJira}
      hasDesign={hasDesign}
      hasQa={hasQa}
      orderKind={orderKind}
    />
  );

  if (docs.length === 0) {
    return (
      <div>
        {header}
        <Empty
          description={
            <span>
              전용 탭이 없는 문서가 없습니다.
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>
                에이전트가 임의 이름으로 남긴 루트 마크다운 문서가 있으면 여기 모입니다.
              </Text>
            </span>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {header}
      <Title level={4}>기타 문서 ({docs.length})</Title>
      <Text type="secondary" style={{ fontSize: 13 }}>
        전용 탭이 없는 문서입니다. 에이전트가 조사 결과를 자기 이름으로 남긴 것이 대부분입니다.
      </Text>

      {/* 문서가 여러 개면 목차로 건너뛴다(파일 하나가 수십 KB일 수 있다).
          목차는 **스크롤해도 계속 보여야 한다** — 하나를 눌러 내려간 뒤 다른 문서로 옮기려고
          매번 맨 위까지 되올라가야 했다. 머리띠 둘 아래에 고정하고, 누른 문서의 제목이
          그 목차에 가리지 않도록 목차 높이만큼 더 내려 세운다. */}
      {docs.length > 1 && (
        // ⛔ 여백은 **바깥 div** 에 준다. Anchor 에 marginTop 을 주면 고정될 때 그 여백까지
        //    고정 영역 안으로 따라 들어가 목차가 그만큼 내려앉고, 누른 문서의 머리가 가린다.
        <div ref={anchorRef} style={{ marginTop: 12 }}>
          <Anchor
            affix
            offsetTop={headerBottom}
            targetOffset={headerBottom + anchorH + GAP}
            style={{ background: "#fff" }}
            direction="horizontal"
            items={docs.map((d) => ({
              key: d.name,
              href: `#${encodeURIComponent(d.name)}`,
              title: d.name,
            }))}
          />
        </div>
      )}

      <Space orientation="vertical" size={16} style={{ width: "100%", marginTop: 16 }}>
        {docs.map((d) => (
          <Card
            key={d.name}
            id={encodeURIComponent(d.name)}
            size="small"
            title={
              <Space size={8}>
                <FileTextOutlined />
                <Text code>{d.name}</Text>
                <Tag style={{ margin: 0 }}>{Math.max(1, Math.round(d.bytes / 1024))} KB</Tag>
              </Space>
            }
            extra={
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(d.content)}`}
                download={d.name}
              >
                다운로드
              </a>
            }
          >
            <MarkdownDoc md={d.content} />
          </Card>
        ))}
      </Space>
    </div>
  );
}

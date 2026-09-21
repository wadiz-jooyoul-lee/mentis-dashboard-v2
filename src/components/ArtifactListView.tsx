"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Typography,
  Space,
  Card,
  Tag,
  Empty,
  Button,
  Row,
  Col,
  Input,
  Tooltip,
  Breadcrumb,
  message,
} from "antd";
import {
  CopyOutlined,
  ExportOutlined,
  ShareAltOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ArtifactEntry } from "@/lib/orchestration";

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

/**
 * 게시된 아티팩트를 오더 구분 없이 갱신 최신순으로 모아 보여 준다.
 *
 * 오더 상세의 "아티팩트" 탭은 그 오더 것만 보여 주므로, 링크를 찾으려면 어느 오더였는지를
 * 먼저 기억해야 했다. 이 화면이 그것을 받는다.
 */
export default function ArtifactListView({ items }: { items: ArtifactEntry[] }) {
  // ⛔ 훅은 조기 반환보다 위에 있어야 한다 — 아래 "0건" 분기 뒤로 내리면 렌더마다 훅 개수가
  //    달라져 React가 터진다.
  const [q, setQ] = useState("");

  // 제목이 1차 대상이지만, 오더 키·오더 제목으로도 찾게 둔다 — "그 이슈에서 올린 거"로
  // 기억하는 경우가 많고, 대상을 넓혀도 오탐이 생기지 않는다.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((a) =>
      [a.title, a.epicKey, a.orderTitle ?? "", a.slug]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  // 최상위 화면이라 상세처럼 OrderHeader가 없다 — 홈으로 돌아갈 길을 여기서 준다
  // (/agents 와 같은 형식).
  const crumb = (
    <Breadcrumb
      items={[{ title: <Link href="/">홈</Link> }, { title: "아티팩트" }]}
      style={{ marginBottom: 12 }}
    />
  );

  if (items.length === 0) {
    return (
      <div>
        {crumb}
        <Title level={2} style={{ marginTop: 0 }}>
          아티팩트
        </Title>
        <Empty
          description={
            <span>
              게시된 아티팩트가 없습니다.
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>
                대화형 Claude Code에서 <Text code>/dobby-share {"{키}"}</Text> 로 게시하면 여기 모입니다.
              </Text>
            </span>
          }
        />
      </div>
    );
  }

  const orders = new Set(items.map((i) => i.epicKey)).size;

  return (
    <div>
      {crumb}
      <Title level={2} style={{ marginTop: 0 }}>
        아티팩트 <Text type="secondary" style={{ fontSize: 16 }}>({items.length})</Text>
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        공개용으로 게시한 아티팩트를 갱신 최신순으로 모았습니다. 오더 {orders}개에서 나왔습니다.
      </Paragraph>

      <Input
        allowClear
        size="large"
        prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
        placeholder="제목·오더로 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 420, marginBottom: 20 }}
      />

      {shown.length === 0 ? (
        <Empty description={`"${q}" 와 맞는 아티팩트가 없습니다.`} />
      ) : (
      <Row gutter={[16, 16]}>
        {shown.map((a) => (
          <Col key={`${a.epicKey}-${a.slug}-${a.url}`} xs={24} sm={12} lg={8}>
            <Card
              size="small"
              hoverable
              style={{ height: "100%" }}
              // 본문과 버튼 사이를 밀어 카드 높이가 달라도 버튼 줄이 아래에 맞춰 선다.
              styles={{ body: { display: "flex", flexDirection: "column", height: "100%" } }}
            >
              <Space size={6} wrap align="center" style={{ marginBottom: 8 }}>
                <ShareAltOutlined style={{ color: "#1677ff" }} />
                {/* 옛 불릿 형식은 슬러그가 없어 파서가 legacy를 붙인다 — 사용자에겐 의미 없어 숨긴다. */}
                {a.slug !== "legacy" && <Tag style={{ margin: 0 }}>{a.slug}</Tag>}
                <Tag color={a.workType === "code" ? "blue" : "purple"} style={{ margin: 0 }}>
                  {a.workType === "code" ? "개발" : "비개발"}
                </Tag>
              </Space>

              {/* 제목 자체가 아티팩트로 가는 링크다 — 카드마다 큰 버튼을 두는 것보다 조용하다. */}
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: "inherit" }}
                title={a.url}
              >
                {a.title}
              </a>

              <div style={{ marginTop: 6 }}>
                <Link href={`/orchestration/${a.epicKey}`} style={{ fontSize: 13 }}>
                  {a.epicKey}
                </Link>
                {a.orderTitle && (
                  <Text type="secondary" style={{ fontSize: 13 }} ellipsis>
                    {" · "}
                    {a.orderTitle}
                  </Text>
                )}
              </div>

              {/* 갱신 시각과 버튼을 한 줄에 둔다 — 카드 아래를 가로지르는 큰 버튼 띠를 없앤다.
                  설명은 '갱신' 바로 뒤에 붙인다(뒤로 밀면 '생성'에 대한 설명처럼 읽힌다). */}
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 10,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 8,
                }}
              >
                <Text type="secondary" style={{ fontSize: 12, flex: 1, lineHeight: 1.5 }}>
                  갱신 {a.sortAt}
                  {a.updateNote && ` (${a.updateNote})`}
                </Text>
                <Space size={0}>
                  <Tooltip title="링크 복사">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => copyText(a.url)}
                    />
                  </Tooltip>
                  <Tooltip title="새 탭에서 열기">
                    <Button
                      type="text"
                      size="small"
                      icon={<ExportOutlined />}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                    />
                  </Tooltip>
                </Space>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      )}
    </div>
  );
}

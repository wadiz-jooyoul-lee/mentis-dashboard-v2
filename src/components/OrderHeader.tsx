"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Breadcrumb, Typography, Space, Tag, Button, Tabs } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import DobbyIcon from "@/components/DobbyIcon";
import { dobbyColor } from "@/lib/dobby";
import { jiraUrl } from "@/lib/jira";

const { Title } = Typography;

// 오더 상세의 공통 탭. 어느 상세 페이지에서든 이 바로 서로 이동한다.
const TABS = [
  { key: "board", label: "보드" },
  { key: "changes", label: "코드 변경" },
  { key: "explain", label: "구현 내용" },
  { key: "console", label: "콘솔" },
];

function routeFor(key: string, tab: string): string {
  if (tab === "changes") return `/orchestration/${key}/changes`;
  if (tab === "explain") return `/orchestration/${key}/explain`;
  if (tab === "console") return `/orchestration/console/${key}`;
  return `/orchestration/${key}`;
}

function activeTab(pathname: string): string {
  if (pathname.startsWith("/orchestration/console/")) return "console";
  if (pathname.endsWith("/changes")) return "changes";
  if (pathname.endsWith("/explain")) return "explain";
  return "board";
}

/**
 * 오더 상세(보드·코드 변경·구현 내용·콘솔) 공통 헤더.
 * 브레드크럼 + 제목/태그 + 탭 네비를 상단 sticky 풀블리드로 그려, 모든 상세 페이지에서 동일하게 보인다.
 * `extra`에는 페이지별 우측 컨트롤(예: 보드의 소감 컨트롤)을 넣는다.
 */
export default function OrderHeader({
  epicKey,
  mode = null,
  worktreeRemoved = false,
  extra,
}: {
  epicKey: string;
  mode?: string | null;
  worktreeRemoved?: boolean;
  extra?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const active = activeTab(pathname);

  return (
    <div
      style={{
        position: "sticky",
        top: 64,
        zIndex: 90,
        background: "#fff",
        // 배경·보더는 뷰포트 전체 너비(풀블리드)로, 상단 콘텐츠 패딩(24)은 상쇄
        marginLeft: "calc(-50vw + 50%)",
        marginRight: "calc(-50vw + 50%)",
        marginTop: -24,
        padding: "12px 0 0",
        borderBottom: "1px solid #f0f0f0",
      }}
    >
      {/* 안쪽 내용은 본문(Content maxWidth 1080)과 같은 가운데 정렬로 맞춰 좌측 쏠림 방지 */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Breadcrumb
          items={[
            { title: <Link href="/">홈</Link> },
            { title: <Link href="/orchestration">오케스트레이션</Link> },
            { title: epicKey },
          ]}
        />
        <Space align="center" size={8}>
          <Link
            href="/agents"
            style={{
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
            }}
          >
            <DobbyIcon size={18} expression="happy" color={dobbyColor("소개")} />
            에이전트 소개
          </Link>
          {extra}
        </Space>
      </div>
      <Space align="center" size={12} wrap style={{ marginBottom: 4 }}>
        <Title level={2} style={{ margin: 0 }}>
          {epicKey}
        </Title>
        {mode && <Tag>{mode}</Tag>}
        {worktreeRemoved && (
          <Tag color="default" style={{ color: "#8c8c8c" }}>
            워크트리 삭제됨
          </Tag>
        )}
        <Button
          type="link"
          icon={<LinkOutlined />}
          href={jiraUrl(epicKey)}
          target="_blank"
        >
          Jira에서 열기
        </Button>
      </Space>
      <Tabs
        activeKey={active}
        items={TABS}
        onChange={(k) => router.push(routeFor(epicKey, k))}
        style={{ marginBottom: 0 }}
        tabBarStyle={{ marginBottom: 0 }}
      />
      </div>
    </div>
  );
}

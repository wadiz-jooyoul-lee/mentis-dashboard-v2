"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layout, Menu } from "antd";
import AutoRefresh from "@/components/AutoRefresh";
import InProgressBackupTrigger from "@/components/InProgressBackupTrigger";
import { CanActProvider } from "@/components/CanAct";
import LanToggle from "@/components/LanToggle";
import MantisIcon from "@/components/MantisIcon";

const { Header, Content } = Layout;

/** 머리띠 가운데 메뉴. 경로가 바로 키다. */
const NAV = [
  { key: "/", label: <Link href="/">홈</Link> },
  { key: "/orchestration", label: <Link href="/orchestration">오케스트레이션</Link> },
  { key: "/artifacts", label: <Link href="/artifacts">아티팩트</Link> },
];

/**
 * 지금 보고 있는 화면이 셋 중 어느 것인가.
 *
 * ⛔ **그 화면 자체일 때만** 켠다. 아래로 들어간 경로(오더 상세 /orchestration/FE1-1787,
 * 그 안의 탭 /orchestration/{키}/artifact)에서는 아무것도 켜지 않는다.
 *
 * 뿌리로 켜 보았는데, 상세로 들어가도 「오케스트레이션」이 계속 눌린 채로 남아 지금 목록에
 * 있는 것처럼 보였다. 머리띠 메뉴는 «지금 어디인가» 가 아니라 «어디로 갈 수 있나» 를
 * 가리키는 자리다 — 상세에서 지금 위치를 말해 주는 것은 그 아래 브레드크럼이다.
 */
function currentNavKey(pathname: string): string[] {
  return NAV.some((n) => n.key === pathname) ? [pathname] : [];
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <CanActProvider>
    <InProgressBackupTrigger />
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          background: "#001529",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
          width: "100%",
        }}
      >
        <Link
          href="/"
          style={{
            color: "#fff",
            fontSize: 20,
            fontWeight: 600,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <MantisIcon size={26} color="#95de64" />
          Mentis Dashboard
        </Link>
        {/*
          좌우(제목·도구)의 폭이 달라 space-between 으로는 가운데에 오지 않는다.
          머리띠가 position:sticky 라 좌표 기준이 되므로 절대 배치로 화면 가운데에 둔다.
        */}
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={currentNavKey(pathname)}
          items={NAV}
          // 셋뿐이라 접을 이유가 없다. 절대 배치라 폭이 0 으로 재어져
          // 마지막 칸이 "..." 로 접히는 것을 막는다.
          disabledOverflow
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            background: "transparent",
            borderBottom: "none",
            minWidth: 0,
          }}
        />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 20 }}>
          <LanToggle />
          <AutoRefresh intervalMs={30000} />
        </span>
      </Header>
      <Content
        style={{ padding: 24, maxWidth: 1080, margin: "0 auto", width: "100%" }}
      >
        {children}
      </Content>
    </Layout>
    </CanActProvider>
  );
}

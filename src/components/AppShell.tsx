"use client";

import Link from "next/link";
import { Layout } from "antd";
import AutoRefresh from "@/components/AutoRefresh";
import MantisIcon from "@/components/MantisIcon";

const { Header, Content } = Layout;

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          background: "#001529",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6 }}>v2 · go-dobby</span>
        </Link>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 18 }}>
          <Link href="/" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 14 }}>
            오더
          </Link>
          <Link href="/agents" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none", fontSize: 14 }}>
            에이전트
          </Link>
          <AutoRefresh intervalMs={30000} />
        </span>
      </Header>
      <Content
        style={{ padding: 24, maxWidth: 1080, margin: "0 auto", width: "100%" }}
      >
        {children}
      </Content>
    </Layout>
  );
}

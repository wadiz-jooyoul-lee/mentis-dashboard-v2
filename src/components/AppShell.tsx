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
        <AutoRefresh intervalMs={30000} />
      </Header>
      <Content
        style={{ padding: 24, maxWidth: 1080, margin: "0 auto", width: "100%" }}
      >
        {children}
      </Content>
    </Layout>
  );
}

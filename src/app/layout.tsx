import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Mentis Dashboard",
  description: "issue-test 결과(.issue-test) 리포트 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <AntdRegistry>
          <ConfigProvider locale={koKR}>
            <AppShell>{children}</AppShell>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}

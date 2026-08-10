"use client";

import Link from "next/link";
import { Breadcrumb } from "antd";
import MarkdownDoc from "@/components/MarkdownDoc";

/** ABOUT.md(저장소 루트)를 그대로 렌더하는 소개 페이지. mermaid·표는 MarkdownDoc이 그린다. */
export default function AboutView({ md }: { md: string }) {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link href="/">홈</Link> }, { title: "소개" }]}
      />
      <MarkdownDoc md={md} />
    </div>
  );
}

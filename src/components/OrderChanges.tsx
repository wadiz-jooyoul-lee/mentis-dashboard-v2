"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Breadcrumb, Typography, Space, Card, Empty, Tag } from "antd";
import DobbyIcon from "@/components/DobbyIcon";
import AgentWorkView from "@/components/AgentWorkView";
import { dobbyColor } from "@/lib/dobby";
import type { EpicDetail } from "@/lib/orchestration";

const { Title, Text, Paragraph } = Typography;

/** 오더의 에이전트별 작업 내역 페이지(구 OrchestrationChanges). 에이전트 클릭 시 앵커로 진입. */
export default function OrderChanges({
  orderKey,
  epic,
}: {
  orderKey: string;
  epic: EpicDetail | null;
}) {
  const roleBySlug = new Map(
    (epic?.contracts ?? []).map((c) => [c.slug, c.role.replace(/\s*계약\s*$/, "").trim()])
  );
  const works = epic?.agentWorks ?? [];

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href={`/orders/${orderKey}`}>{orderKey}</Link> },
          { title: "변경 내역" },
        ]}
      />
      <Title level={3} style={{ margin: 0 }}>
        변경 내역 — {orderKey}
      </Title>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        각 에이전트의 대화 로그에서 뽑아낸 실제 작업 내역(수정 파일·커밋·diff·요약)입니다.
      </Paragraph>

      {works.length === 0 ? (
        <Empty description="작업 로그 기록이 없습니다 (agent-logs.json 미생성)" />
      ) : (
        <>
          <Space size={[8, 8]} wrap>
            {works.map((w) => {
              const name = roleBySlug.get(w.slug) ?? w.slug;
              return (
                <a key={w.slug} href={`#agent-${w.slug}`}>
                  <Tag style={{ cursor: "pointer", color: dobbyColor(name), borderColor: dobbyColor(name), background: "transparent", fontWeight: 600 }}>
                    {name}
                  </Tag>
                </a>
              );
            })}
          </Space>

          {works.map((w) => {
            const name = roleBySlug.get(w.slug) ?? w.slug;
            const color = dobbyColor(name);
            return (
              <div key={w.slug} id={`agent-${w.slug}`} style={{ scrollMarginTop: 80 }}>
                <Card
                  title={
                    <Space size={8} align="center">
                      <DobbyIcon size={26} expression="tired" color={color} />
                      <Text strong style={{ fontSize: 16 }}>{name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{w.slug}</Text>
                    </Space>
                  }
                >
                  <AgentWorkView work={w} />
                </Card>
              </div>
            );
          })}
        </>
      )}
    </Space>
  );
}

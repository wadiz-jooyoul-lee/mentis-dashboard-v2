"use client";

import Link from "next/link";
import { Card, Col, Row, Tag, Typography, Space } from "antd";
import {
  ExperimentOutlined,
  RocketOutlined,
  CheckSquareOutlined,
  DeploymentUnitOutlined,
  ClusterOutlined,
} from "@ant-design/icons";
import type { Section } from "@/lib/sections";
import { AREA_LABELS, AREA_ORDER } from "@/lib/sections";
import type { Metric } from "@/lib/lifecycle";

const { Title, Paragraph, Text } = Typography;

const ICONS = {
  ExperimentOutlined: ExperimentOutlined,
  RocketOutlined: RocketOutlined,
  CheckSquareOutlined: CheckSquareOutlined,
  DeploymentUnitOutlined: DeploymentUnitOutlined,
  ClusterOutlined: ClusterOutlined,
};

const METRIC_COLOR: Record<string, string> = {
  blue: "#1677ff",
  green: "#52c41a",
  red: "#ff4d4f",
  orange: "#fa8c16",
};

function Metrics({ metrics }: { metrics: Metric[] }) {
  return (
    <Space size={20} style={{ marginTop: 14 }} wrap align="start">
      {metrics.map((m) => (
        <div key={m.label} style={{ lineHeight: 1.25 }}>
          <div>
            <span
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: m.color ? METRIC_COLOR[m.color] : undefined,
              }}
            >
              {m.value}
            </span>{" "}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {m.label}
            </Text>
          </div>
          {m.today !== undefined && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              오늘 {m.today}
            </Text>
          )}
        </div>
      ))}
    </Space>
  );
}

function SectionCard({
  section,
  metrics,
}: {
  section: Section;
  metrics: Metric[];
}) {
  const Icon = ICONS[section.icon];
  const body = (
    <Card
      hoverable={section.enabled}
      style={{ height: "100%", opacity: section.enabled ? 1 : 0.55 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon style={{ fontSize: 28, color: "#1677ff" }} />
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {section.title}{" "}
            {!section.enabled && <Tag color="default">준비 중</Tag>}
          </Title>
        </div>
      </div>
      <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        {section.description}
      </Paragraph>
      {metrics.length > 0 ? (
        <Metrics metrics={metrics} />
      ) : (
        section.enabled && (
          <Text
            type="secondary"
            style={{ fontSize: 12, marginTop: 14, display: "block" }}
          >
            아직 기록 없음
          </Text>
        )
      )}
    </Card>
  );

  if (!section.enabled) return body;

  return (
    <Link href={section.path} style={{ display: "block", height: "100%" }}>
      {body}
    </Link>
  );
}

export default function SectionGrid({
  sections,
  stats,
}: {
  sections: Section[];
  stats: Record<string, Metric[]>;
}) {
  return (
    <div>
      <Title level={2} style={{ marginTop: 0 }}>
        대시보드
      </Title>
      <Paragraph type="secondary">보고 싶은 항목을 선택하세요.</Paragraph>
      {AREA_ORDER.map((area) => {
        const items = sections.filter((s) => s.area === area);
        if (items.length === 0) return null;
        return (
          <div key={area} style={{ marginTop: 24 }}>
            <Title
              level={5}
              type="secondary"
              style={{ marginTop: 0, marginBottom: 12, fontWeight: 600 }}
            >
              {AREA_LABELS[area]}
            </Title>
            <Row gutter={[16, 16]}>
              {items.map((s) => (
                <Col key={s.key} xs={24} sm={12} md={8}>
                  <SectionCard section={s} metrics={stats[s.key] ?? []} />
                </Col>
              ))}
            </Row>
          </div>
        );
      })}
    </div>
  );
}

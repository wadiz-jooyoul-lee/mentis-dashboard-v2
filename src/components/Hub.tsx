"use client";

import Link from "next/link";
import { Card, Col, Row, Statistic, Typography, Space, Tag } from "antd";
import { ClusterOutlined, TeamOutlined, RightOutlined } from "@ant-design/icons";
import type { Metric } from "@/lib/orders";

const { Title, Paragraph } = Typography;

const METRIC_COLOR: Record<string, string> = {
  blue: "#1677ff",
  green: "#52c41a",
  orange: "#fa8c16",
  default: "#8c8c8c",
};

export default function Hub({
  metrics,
  orderCount,
}: {
  metrics: Metric[];
  orderCount: number;
}) {
  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          go-dobby 오더 현황
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          모든 작업은 <code>dobby-order</code> 하나로 시작합니다. 오더 = <code>$DOBBY_META/{"{키}"}/</code> 한 폴더.
          착수 → 분석 → 구현/산출 → 리뷰 → 통합 → 검증 → 해결 → 종료.
        </Paragraph>
      </div>

      {metrics.length > 0 && (
        <Card size="small">
          <Row gutter={[24, 16]}>
            {metrics.map((m) => (
              <Col key={m.label} xs={12} sm={8} md={6}>
                <Statistic
                  title={
                    <Space size={4}>
                      {m.label}
                      {m.today ? <Tag color="blue">오늘 {m.today}</Tag> : null}
                    </Space>
                  }
                  value={m.value}
                  valueStyle={{ color: m.color ? METRIC_COLOR[m.color] : undefined }}
                />
              </Col>
            ))}
          </Row>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Link href="/orders" style={{ textDecoration: "none" }}>
            <Card hoverable>
              <Space align="start" size={16}>
                <ClusterOutlined style={{ fontSize: 28, color: "#1677ff" }} />
                <div>
                  <Title level={5} style={{ margin: 0 }}>
                    오더 <RightOutlined style={{ fontSize: 12 }} />
                  </Title>
                  <Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
                    이슈·작업 {orderCount}건. 단계·팬아웃 K·work-type·통과율을 한눈에.
                  </Paragraph>
                </div>
              </Space>
            </Card>
          </Link>
        </Col>
        <Col xs={24} md={12}>
          <Link href="/agents" style={{ textDecoration: "none" }}>
            <Card hoverable>
              <Space align="start" size={16}>
                <TeamOutlined style={{ fontSize: 28, color: "#52c41a" }} />
                <div>
                  <Title level={5} style={{ margin: 0 }}>
                    에이전트 소개 <RightOutlined style={{ fontSize: 12 }} />
                  </Title>
                  <Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
                    오케스트레이션에 참여하는 도비 에이전트들.
                  </Paragraph>
                </div>
              </Space>
            </Card>
          </Link>
        </Col>
      </Row>
    </Space>
  );
}

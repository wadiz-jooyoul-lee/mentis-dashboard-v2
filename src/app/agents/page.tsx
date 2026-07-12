"use client";

import Link from "next/link";
import { Breadcrumb, Card, Col, Row, Typography, Tag } from "antd";
import DobbyIcon, { type DobbyExpression } from "@/components/DobbyIcon";
import { dobbyColor } from "@/lib/dobby";

const { Title, Paragraph, Text } = Typography;

type Agent = {
  name: string;
  expression: DobbyExpression;
  personality: string;
  likes: string;
};

// hue가 골고루 퍼지도록 선정(20~336). 성격·좋아하는 것은 재미로 붙인 소개용.
const AGENTS: Agent[] = [
  { name: "지면", expression: "curious", personality: "감각적인 완벽주의자. 1px만 어긋나도 귀신같이 찾아내는 화면의 예술가.", likes: "픽셀 딱 맞는 정렬" },
  { name: "리뷰", expression: "curious", personality: "궁금증 대장. ‘왜?’를 입에 달고 사는 관찰자, 근거 없으면 못 넘어간다.", likes: "근거가 분명한 변경" },
  { name: "배송", expression: "happy", personality: "약속한 시간은 반드시 지키는 성실왕. 늦는 걸 제일 싫어한다.", likes: "정시 도착 알림" },
  { name: "펀딩", expression: "happy", personality: "열정적인 응원가. 목표 달성이 세상에서 제일 행복한 일.", likes: "100% 넘는 달성 그래프" },
  { name: "상품", expression: "happy", personality: "진열의 달인. 무엇이든 먹음직스럽게 보이도록 배치한다.", likes: "잘 팔리는 베스트 배지" },
  { name: "추천", expression: "thinking", personality: "눈치 백단 큐레이터. 취향을 골똘히 분석하는 게 취미.", likes: "딱 맞는 추천 적중" },
  { name: "메이커", expression: "happy", personality: "아이디어가 넘치는 창작자. 늘 새 프로젝트를 궁리 중.", likes: "반짝이는 새 기획" },
  { name: "어드민", expression: "thinking", personality: "꼼꼼한 정리왕. 폼 필드 순서가 안 맞으면 잠을 설친다.", likes: "완벽하게 정렬된 입력 폼" },
  { name: "정산", expression: "tired", personality: "숫자 앞에선 한 치 오차도 용납 못 하는 계산가.", likes: "딱 떨어지는 잔액" },
  { name: "검색", expression: "happy", personality: "호기심 많은 탐험가. 무엇이든 번개처럼 찾아온다.", likes: "빠른 인덱스" },
  { name: "코드리뷰", expression: "curious", personality: "냉정한 심판관. blocking 하나에도 눈빛이 매서워진다.", likes: "깨끗한 diff와 통과하는 테스트" },
  { name: "마이페이지", expression: "happy", personality: "다정한 비서. 내 정보를 늘 단정하게 챙겨준다.", likes: "깔끔한 프로필 카드" },
];

export default function AgentsPage() {
  return (
    <div>
      <Breadcrumb
        items={[{ title: <Link href="/">홈</Link> }, { title: "에이전트 소개" }]}
        style={{ marginBottom: 12 }}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        에이전트 소개
      </Title>
      <Paragraph type="secondary">
        work-dobby가 부리는 도비 에이전트들. 이름마다 고유한 색과 표정을 가집니다.
      </Paragraph>

      <Row gutter={[16, 16]}>
        {AGENTS.map((a) => {
          const color = dobbyColor(a.name);
          return (
            <Col key={a.name} xs={24} sm={12} md={8} lg={6}>
              <Card style={{ height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <DobbyIcon size={56} expression={a.expression} color={color} />
                  <div>
                    <Title level={4} style={{ margin: 0 }}>
                      {a.name}
                    </Title>
                    <Tag
                      style={{
                        marginTop: 4,
                        color,
                        borderColor: color,
                        background: "transparent",
                        fontWeight: 600,
                      }}
                    >
                      {color}
                    </Tag>
                  </div>
                </div>
                <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
                  {a.personality}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  💜 좋아하는 것: {a.likes}
                </Text>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}

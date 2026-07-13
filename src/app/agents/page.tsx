"use client";

import Link from "next/link";
import { Breadcrumb, Card, Col, Row, Typography, Tag, Space } from "antd";
import DobbyIcon, { type DobbyExpression } from "@/components/DobbyIcon";
import BtsAvatar, { btsColor } from "@/components/BtsAvatar";
import { dobbyColor } from "@/lib/dobby";

const { Title, Paragraph, Text } = Typography;

type Agent = {
  name: string;
  expression: DobbyExpression;
  personality: string;
  likes: string;
  // 실제 인물 프로필용(선택) — BTS 등
  realName?: string;
  birth?: string;
  position?: string;
  // true면 도비 아이콘 대신 이름(멤버)에 맞는 BTS 오리지널 아바타를 그린다.
  bts?: boolean;
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

// 방탄소년단(BTS) 멤버 — 실제 프로필(본명·생년월일·포지션) 기반. 성격 한 줄은 대표 특징에서 뽑았다.
const BTS: Agent[] = [
  { name: "RM", bts: true, realName: "김남준", birth: "1994-09-12", position: "리더 · 메인래퍼", expression: "thinking", personality: "팀을 이끄는 명석한 지휘자. 다만 손대는 건 곧잘 부숴서 '파괴신'이라 불린다.", likes: "논리적으로 딱 맞는 구조" },
  { name: "진", bts: true, realName: "김석진", birth: "1992-12-04", position: "서브보컬 · 비주얼", expression: "happy", personality: "‘월드와이드 핸섬’ 비주얼 담당 맏형. 나이는 제일 많은데 장난기도 제일 많다.", likes: "빵 터지는 아재개그" },
  { name: "슈가", bts: true, realName: "민윤기", birth: "1993-03-09", position: "리드래퍼 · 프로듀서", expression: "resting", personality: "곡을 짓는 리드래퍼 겸 프로듀서(Agust D). 무심한 듯해도 속은 누구보다 따뜻하다.", likes: "완성도 높은 트랙" },
  { name: "제이홉", bts: true, realName: "정호석", birth: "1994-02-18", position: "메인댄서 · 댄스캡틴", expression: "happy", personality: "‘희망’ 그 자체인 메인댄서 겸 댄스캡틴. 어디서든 긍정 에너지를 뿜는다.", likes: "완벽하게 맞는 군무" },
  { name: "지민", bts: true, realName: "박지민", birth: "1995-10-13", position: "메인댄서 · 리드보컬", expression: "curious", personality: "부드러운 춤과 고음을 지닌 메인댄서·리드보컬. 무대에 진심인 섬세한 완벽주의자.", likes: "관객이 숨죽이는 무대" },
  { name: "뷔", bts: true, realName: "김태형", birth: "1995-12-30", position: "서브보컬 · 비주얼", expression: "thinking", personality: "깊은 저음과 비주얼의 서브보컬. 사진과 연기를 사랑하는 자유로운 예술가.", likes: "감성 가득한 사진 한 컷" },
  { name: "정국", bts: true, realName: "전정국", birth: "1997-09-01", position: "메인보컬 · 센터 · 막내", expression: "happy", personality: "노래·춤·랩·운동까지 다 잘하는 ‘황금막내’. 팀의 센터이자 막내.", likes: "새로 도전하는 모든 것" },
];

function AgentCard({ a }: { a: Agent }) {
  // BTS 멤버는 시그니처 색 + 오리지널 아바타, 그 외 도비 에이전트는 해시 색 + 도비 아이콘.
  const color = (a.bts && btsColor(a.name)) || dobbyColor(a.name);
  return (
    <Card style={{ height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {a.bts ? (
          <BtsAvatar member={a.name} size={56} />
        ) : (
          <DobbyIcon size={56} expression={a.expression} color={color} />
        )}
        <div>
          <Title level={4} style={{ margin: 0 }}>
            {a.name}
          </Title>
          <Space size={4} wrap style={{ marginTop: 4 }}>
            <Tag
              style={{
                color,
                borderColor: color,
                background: "transparent",
                fontWeight: 600,
              }}
            >
              {color}
            </Tag>
            {a.position && <Tag color="geekblue">{a.position}</Tag>}
          </Space>
        </div>
      </div>
      {(a.realName || a.birth) && (
        <Text type="secondary" style={{ display: "block", marginTop: 10, fontSize: 13 }}>
          {[a.realName, a.birth].filter(Boolean).join(" · ")}
        </Text>
      )}
      <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>{a.personality}</Paragraph>
      <Text type="secondary" style={{ fontSize: 13 }}>
        💜 좋아하는 것: {a.likes}
      </Text>
    </Card>
  );
}

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
        {AGENTS.map((a) => (
          <Col key={a.name} xs={24} sm={12} md={8} lg={6}>
            <AgentCard a={a} />
          </Col>
        ))}
      </Row>

      <Title level={3} style={{ marginTop: 40 }}>
        방탄소년단 (BTS)
      </Title>
      <Paragraph type="secondary">
        재미로 추가한 BTS 멤버 에이전트. 본명·생년월일·포지션은 실제 프로필을, 성격 한 줄은 대표 특징을 담았습니다.
      </Paragraph>

      <Row gutter={[16, 16]}>
        {BTS.map((a) => (
          <Col key={a.name} xs={24} sm={12} md={8} lg={6}>
            <AgentCard a={a} />
          </Col>
        ))}
      </Row>
    </div>
  );
}

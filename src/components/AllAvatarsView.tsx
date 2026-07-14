"use client";

import Link from "next/link";
import { Breadcrumb, Typography, Card, Tag } from "antd";
import BtsAvatar, { BTS_AVATARS, btsColor } from "@/components/BtsAvatar";
import Fromis9Avatar, { FROMIS_AVATARS, fromisColor } from "@/components/Fromis9Avatar";
import DobbyIcon, { dobbyExpression } from "@/components/DobbyIcon";
import { dobbyColor } from "@/lib/dobby";

const { Title, Paragraph, Text } = Typography;

// 에이전트 상태 어휘(순서). 표정이 바뀌는 상태만 캡션을 붙인다.
const STATES = ["대기", "분석중", "구현중", "리뷰중", "수정중", "재통합대기", "완료"];
const CAPTION: Record<string, string> = { 대기: "심심", 구현중: "집중", 수정중: "헐레벌떡" };

function MemberRow({
  member,
  color,
  kind,
}: {
  member: string;
  color: string;
  kind: "bts" | "fromis";
}) {
  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ minWidth: 88 }}>
          <Text strong style={{ fontSize: 16 }}>
            {member}
          </Text>
          <div>
            <Tag style={{ marginTop: 4, color, borderColor: color, background: "transparent" }}>
              {color}
            </Tag>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
          {STATES.map((s) => (
            <div key={s} style={{ textAlign: "center", flexShrink: 0, width: 60 }}>
              {kind === "bts" ? (
                <BtsAvatar member={member} size={52} state={s} />
              ) : (
                <Fromis9Avatar member={member} size={52} state={s} />
              )}
              <div style={{ fontSize: 12, marginTop: 2 }}>{s}</div>
              {CAPTION[s] && (
                <div style={{ fontSize: 11, color, fontWeight: 600 }}>{CAPTION[s]}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export default function AllAvatarsView() {
  const bts = Object.keys(BTS_AVATARS);
  const fromis = Object.keys(FROMIS_AVATARS);
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/agents">에이전트 소개</Link> },
          { title: "상태별 표정" },
        ]}
      />
      <Title level={2} style={{ marginTop: 0 }}>
        전체 에이전트 · 상태별 표정
      </Title>
      <Paragraph type="secondary">
        도비를 제외한 그룹 아바타(BTS·프로미스나인)의 상태별 표정입니다. <b>대기(심심) · 구현중(집중) ·
        수정중(헐레벌떡)</b>만 표정이 바뀌고, 나머지 상태(분석중·리뷰중·재통합대기·완료)는 멤버 기본
        표정을 유지합니다.
      </Paragraph>

      <Title level={3}>방탄소년단 (BTS)</Title>
      {bts.map((m) => (
        <MemberRow key={m} member={m} color={btsColor(m) ?? "#888"} kind="bts" />
      ))}

      <Title level={3} style={{ marginTop: 24 }}>
        프로미스나인 (fromis_9)
      </Title>
      {fromis.map((m) => (
        <MemberRow key={m} member={m} color={fromisColor(m) ?? "#888"} kind="fromis" />
      ))}

      <Title level={3} style={{ marginTop: 24 }}>
        도비 (대표)
      </Title>
      <Paragraph type="secondary" style={{ marginTop: -8 }}>
        도비는 색만 다르고 형태가 같아 대표로 하나만 표시합니다. 도비는 자체 상태 표정 로직을 씁니다.
      </Paragraph>
      <Card size="small">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ minWidth: 88 }}>
            <Text strong style={{ fontSize: 16 }}>
              도비
            </Text>
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4 }}>
            {STATES.map((s) => (
              <div key={s} style={{ textAlign: "center", flexShrink: 0, width: 60 }}>
                <DobbyIcon size={52} expression={dobbyExpression(s)} color={dobbyColor("도비")} />
                <div style={{ fontSize: 12, marginTop: 2 }}>{s}</div>
                <div style={{ fontSize: 11, color: "#8c8c8c" }}>{dobbyExpression(s)}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

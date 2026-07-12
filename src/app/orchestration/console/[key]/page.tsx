import Link from "next/link";
import { Breadcrumb, Typography, Space } from "antd";
import JobConsole from "@/components/JobConsole";
import { getJobStatus } from "@/lib/jobs";

const { Title, Paragraph } = Typography;

export const dynamic = "force-dynamic";

export default function OrderConsolePage({
  params,
}: {
  params: { key: string };
}) {
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href="/orchestration">오케스트레이션</Link> },
          { title: `콘솔: ${params.key}` },
        ]}
      />
      <Title level={3} style={{ margin: 0 }}>
        실행 콘솔 — {params.key}
      </Title>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        <code>dobby-order</code> 진행 로그. 실행 중 입력하면 <b>예약</b>(이번 턴 종료 직후 자동 전달),
        유휴 시 <b>즉시 이어서</b> 전달됩니다.
      </Paragraph>
      <JobConsole orderKey={params.key} initial={getJobStatus(params.key)} height={480} />
    </Space>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, Typography, Space } from "antd";
import JobConsole from "@/components/JobConsole";
import { getJobStatus } from "@/lib/jobs";
import { isOrderKey } from "@/lib/config";

const { Title, Paragraph } = Typography;

export const dynamic = "force-dynamic";

export default function OrderConsolePage({
  params,
}: {
  params: { key: string };
}) {
  if (!isOrderKey(params.key)) notFound();
  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Breadcrumb
        items={[
          { title: <Link href="/">홈</Link> },
          { title: <Link href={`/orders/${params.key}`}>{params.key}</Link> },
          { title: "실행 콘솔" },
        ]}
      />
      <Title level={3} style={{ margin: 0 }}>
        실행 콘솔 — {params.key}
      </Title>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        이 오더로 <code>dobby-order</code>를 실행/재개하고 진행 로그를 실시간으로 봅니다. 실행 중 입력하면 예약,
        유휴 시 즉시 이어서 전달됩니다.
      </Paragraph>
      <JobConsole orderKey={params.key} initial={getJobStatus(params.key)} height={480} />
    </Space>
  );
}

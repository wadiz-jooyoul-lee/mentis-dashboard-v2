"use client";

import { Typography, Space, Divider, Tag } from "antd";
import { CodeOutlined, FileTextOutlined } from "@ant-design/icons";
import OrderTable from "@/components/OrderTable";
import type { OrderSummary } from "@/lib/orders";

const { Title, Text, Paragraph } = Typography;

/**
 * 첫 페이지: 모든 작업은 오케스트레이션(오더)이므로 work-type으로만 나눠 보여준다.
 * 개발 작업(code) / 비개발 작업(비소스) 두 그룹. (미분류는 있을 때만)
 */
export default function OrderHome({
  orders,
  metaDir,
  launcher,
}: {
  orders: OrderSummary[];
  metaDir: string;
  launcher?: React.ReactNode;
}) {
  const code = orders.filter((o) => o.workType === "code");
  const nonsource = orders.filter((o) => o.workType === "nonsource");
  const other = orders.filter((o) => o.workType == null);

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          오더
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          모든 작업은 <code>dobby-order</code> 오케스트레이션입니다. 개발/비개발로 나눠 보여줍니다. 읽는 경로:{" "}
          <Text code>{metaDir}</Text>
        </Paragraph>
      </div>

      {launcher}

      <section>
        <Divider titlePlacement="start" orientationMargin={0}>
          <Space size={8}>
            <CodeOutlined style={{ color: "#1677ff" }} />
            <Text strong>개발 작업</Text>
            <Tag color="geekblue">{code.length}</Tag>
          </Space>
        </Divider>
        <OrderTable orders={code} emptyText="개발(code) 오더 없음" />
      </section>

      <section>
        <Divider titlePlacement="start" orientationMargin={0}>
          <Space size={8}>
            <FileTextOutlined style={{ color: "#722ed1" }} />
            <Text strong>비개발 작업</Text>
            <Tag color="purple">{nonsource.length}</Tag>
          </Space>
        </Divider>
        <OrderTable orders={nonsource} emptyText="비개발(비소스) 오더 없음" />
      </section>

      {other.length > 0 && (
        <section>
          <Divider titlePlacement="start" orientationMargin={0}>
            <Space size={8}>
              <Text strong>미분류</Text>
              <Tag>{other.length}</Tag>
            </Space>
          </Divider>
          <OrderTable orders={other} emptyText="미분류 오더 없음" />
        </section>
      )}
    </Space>
  );
}

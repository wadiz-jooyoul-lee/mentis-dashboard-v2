import { notFound } from "next/navigation";
import OrderDetail from "@/components/OrderDetail";
import { getOrder } from "@/lib/orders";
import { isOrderKey } from "@/lib/config";
import { getJobStatus } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default function OrderDetailPage({
  params,
}: {
  params: { key: string };
}) {
  // path traversal 방지: 키 형식(ISSUE-123 | TASK-slug)만 허용.
  if (!isOrderKey(params.key)) notFound();
  const order = getOrder(params.key);
  if (!order) notFound();
  return <OrderDetail order={order} jobStatus={getJobStatus(params.key)} />;
}

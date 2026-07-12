import { notFound } from "next/navigation";
import IssueReport from "@/components/IssueReport";
import { getOrder } from "@/lib/orders";
import { isOrderKey } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function OrderTestPage({
  params,
}: {
  params: { key: string };
}) {
  if (!isOrderKey(params.key)) notFound();
  const order = getOrder(params.key);
  if (!order) notFound();
  return <IssueReport issueKey={params.key} runs={order.runs} />;
}

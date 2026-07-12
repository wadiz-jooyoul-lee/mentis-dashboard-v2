import { notFound } from "next/navigation";
import OrderChanges from "@/components/OrderChanges";
import { getOrder } from "@/lib/orders";
import { isOrderKey } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function OrderChangesPage({
  params,
}: {
  params: { key: string };
}) {
  if (!isOrderKey(params.key)) notFound();
  const order = getOrder(params.key);
  if (!order) notFound();
  return <OrderChanges orderKey={params.key} epic={order.epic} />;
}

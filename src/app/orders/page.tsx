import OrderList from "@/components/OrderList";
import { listOrders } from "@/lib/orders";
import { getMetaDir } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return <OrderList orders={listOrders()} metaDir={getMetaDir()} />;
}

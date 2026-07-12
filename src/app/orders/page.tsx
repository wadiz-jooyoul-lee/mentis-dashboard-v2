import OrderList from "@/components/OrderList";
import OrderLauncher from "@/components/OrderLauncher";
import { listOrders } from "@/lib/orders";
import { getMetaDir } from "@/lib/config";
import { listJobs, listArchivedJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return (
    <OrderList
      orders={listOrders()}
      metaDir={getMetaDir()}
      launcher={<OrderLauncher initialJobs={listJobs()} initialArchived={listArchivedJobs()} />}
    />
  );
}

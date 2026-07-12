import OrderHome from "@/components/OrderHome";
import OrderLauncher from "@/components/OrderLauncher";
import { listOrders } from "@/lib/orders";
import { getMetaDir } from "@/lib/config";
import { listJobs, listArchivedJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <OrderHome
      orders={listOrders()}
      metaDir={getMetaDir()}
      launcher={<OrderLauncher initialJobs={listJobs()} initialArchived={listArchivedJobs()} />}
    />
  );
}

import Hub from "@/components/Hub";
import { getMetrics, listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function Home() {
  const metrics = getMetrics(todayYmd());
  const orderCount = listOrders().length;
  return <Hub metrics={metrics} orderCount={orderCount} />;
}

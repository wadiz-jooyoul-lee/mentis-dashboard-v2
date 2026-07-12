import { getLifecycle } from "@/lib/lifecycle";
import LifecycleView from "@/components/LifecycleView";

export const dynamic = "force-dynamic";

export default function LifecyclePage() {
  return <LifecycleView rows={getLifecycle()} />;
}

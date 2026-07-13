import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE } from "@/lib/keys";
import ExplainerView from "@/components/ExplainerView";

export const dynamic = "force-dynamic";

export default function ExplainPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  return <ExplainerView epicKey={params.key} md={epic?.explainerMd ?? null} />;
}

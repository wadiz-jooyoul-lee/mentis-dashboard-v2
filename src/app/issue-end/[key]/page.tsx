import { getEnd } from "@/lib/lifecycle";
import EndDetail from "@/components/EndDetail";

export const dynamic = "force-dynamic";

export default function EndDetailPage({
  params,
}: {
  params: { key: string };
}) {
  return <EndDetail issueKey={params.key} end={getEnd(params.key)} />;
}

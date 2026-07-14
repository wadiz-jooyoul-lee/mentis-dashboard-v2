import { getEpic } from "@/lib/orchestration";
import { readQuips } from "@/lib/quips";
import OrchestrationBoard from "@/components/OrchestrationBoard";

export const dynamic = "force-dynamic";

export default function OrchestrationDetailPage({
  params,
}: {
  params: { key: string };
}) {
  return (
    <OrchestrationBoard
      epicKey={params.key}
      epic={getEpic(params.key)}
      quips={readQuips(params.key)}
    />
  );
}

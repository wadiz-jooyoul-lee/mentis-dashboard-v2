import { getEpic } from "@/lib/orchestration";
import { readQuips } from "@/lib/quips";
import OrchestrationChanges from "@/components/OrchestrationChanges";

export const dynamic = "force-dynamic";

export default function OrchestrationChangesPage({
  params,
}: {
  params: { key: string };
}) {
  return (
    <OrchestrationChanges
      epicKey={params.key}
      epic={getEpic(params.key)}
      quips={readQuips(params.key)}
    />
  );
}

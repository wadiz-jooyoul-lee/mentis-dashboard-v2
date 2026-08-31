import { getEpic } from "@/lib/orchestration";
import { readQuips } from "@/lib/quips";
import OrchestrationChanges from "@/components/OrchestrationChanges";

export const dynamic = "force-dynamic";

export default async function OrchestrationChangesPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return (
    <OrchestrationChanges
      epicKey={key}
      epic={getEpic(key)}
      quips={readQuips(key)}
    />
  );
}

import { listEpics, getAgentStartDir } from "@/lib/orchestration";
import OrchestrationList from "@/components/OrchestrationList";

export const dynamic = "force-dynamic";

export default function OrchestrationPage() {
  return <OrchestrationList epics={listEpics()} sourceDir={getAgentStartDir()} />;
}

import { listEpics } from "@/lib/orchestration";
import { getMetaDir } from "@/lib/issues";
import { listJobs, listArchivedJobs } from "@/lib/jobs";
import OrchestrationList from "@/components/OrchestrationList";

export const dynamic = "force-dynamic";

export default function OrchestrationPage({
  searchParams,
}: {
  searchParams?: { type?: string };
}) {
  const type = searchParams?.type;
  let epics = listEpics();
  if (type === "code" || type === "nonsource") {
    epics = epics.filter((e) => e.workType === type);
  }
  return (
    <OrchestrationList
      epics={epics}
      sourceDir={getMetaDir()}
      initialJobs={listJobs()}
      initialArchived={listArchivedJobs()}
    />
  );
}

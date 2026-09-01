import { listEpics } from "@/lib/orchestration";
import { getMetaDir } from "@/lib/issues";
import { listJobs, listArchivedJobs } from "@/lib/jobs";
import OrchestrationList from "@/components/OrchestrationList";
import { deletabilityOf } from "@/lib/worktree";

export const dynamic = "force-dynamic";

export default async function OrchestrationPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>;
}) {
  const type = (await searchParams)?.type;
  let epics = listEpics();
  if (type === "code" || type === "nonsource") {
    epics = epics.filter((e) => e.workType === type);
  }
  // 워크트리 삭제 버튼 상태를 첫 렌더부터 옳게 그리기 위해 여기서 미리 판정한다.
  // 작업중 오더는 삭제 대상이 아니므로 제외해 git 호출을 줄인다.
  const finished = epics.filter((e) => e.phase === "해결" || e.phase === "종료" || e.worktreeRemoved);
  const deletable = deletabilityOf(finished.map((e) => e.epicKey));
  return (
    <OrchestrationList
      epics={epics}
      deletable={deletable}
      sourceDir={getMetaDir()}
      initialJobs={listJobs()}
      initialArchived={listArchivedJobs()}
    />
  );
}

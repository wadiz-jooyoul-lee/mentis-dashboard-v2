import { getEpic } from "@/lib/orchestration";
import { readQuips } from "@/lib/quips";
import { getJobStatus } from "@/lib/jobs";
import { isJiraIssueKey } from "@/lib/keys";
import OrchestrationBoard from "@/components/OrchestrationBoard";
import ExplainerView from "@/components/ExplainerView";

export const dynamic = "force-dynamic";

export default async function OrchestrationDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const epic = getEpic(key);

  // "작업 내용 정리"(summary) 오더는 칸반 보드가 없다(에이전트 1명). 베이스 진입은 "작업 내용"을 바로 보여준다.
  if (epic?.orderKind === "summary") {
    const job = getJobStatus(`explain-${key}`);
    return (
      <ExplainerView
        epicKey={key}
        title={epic.title ?? null}
        resolved={epic.resolved}
        md={epic.explainerMd ?? null}
        job={job.state === "none" ? null : { state: job.state, feed: job.feed }}
        mode={epic.orchestration?.mode ?? null}
        worktreeRemoved={epic.worktreeRemoved}
        hasJira={!!epic.jiraIssueMd || isJiraIssueKey(key)}
        orderKind={epic.orderKind}
      />
    );
  }

  return (
    <OrchestrationBoard
      epicKey={key}
      epic={epic}
      quips={readQuips(key)}
    />
  );
}

import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE } from "@/lib/keys";
import JiraTabView from "@/components/JiraTabView";

export const dynamic = "force-dynamic";

export default function JiraPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  // 이슈 원문이 없으면(문서 전용·조회 전 등) Jira 탭 자체가 성립하지 않음.
  if (!epic?.jiraIssueMd) notFound();

  const canEnrich = !!(epic.implementationMd || epic.produceMd || epic.explainerMd);

  return (
    <JiraTabView
      epicKey={params.key}
      mode={epic.orchestration?.mode ?? null}
      worktreeRemoved={epic.worktreeRemoved}
      canEnrich={canEnrich}
      jiraIssueMd={epic.jiraIssueMd}
      jiraIssueCleanMd={epic.jiraIssueCleanMd}
      jiraCommentsMd={epic.jiraCommentsMd}
      jiraEnrichMd={epic.jiraEnrichMd}
      jiraPosted={epic.jiraPosted}
    />
  );
}

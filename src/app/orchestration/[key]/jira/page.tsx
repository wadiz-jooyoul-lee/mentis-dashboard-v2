import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import JiraTabView from "@/components/JiraTabView";

export const dynamic = "force-dynamic";

export default function JiraPage({ params }: { params: { key: string } }) {
  if (!ORDER_KEY_RE.test(params.key)) notFound();
  const epic = getEpic(params.key);
  // Jira 키가 아니고(문서 전용 TASK-) 이슈 원문도 없으면 Jira 탭 성립 X.
  // Jira 키면 아직 이슈를 안 불러왔어도 탭을 열어 "불러오기" 버튼을 제공.
  if (!epic?.jiraIssueMd && !isJiraIssueKey(params.key)) notFound();

  const canEnrich = !!(epic?.implementationMd || epic?.produceMd || epic?.explainerMd);

  return (
    <JiraTabView
      epicKey={params.key}
      title={epic?.title ?? null}
      mode={epic?.orchestration?.mode ?? null}
      worktreeRemoved={epic?.worktreeRemoved ?? false}
      canEnrich={canEnrich}
      jiraIssueMd={epic?.jiraIssueMd ?? null}
      jiraIssueCleanMd={epic?.jiraIssueCleanMd ?? null}
      jiraCommentsMd={epic?.jiraCommentsMd ?? null}
      jiraEnrichMd={epic?.jiraEnrichMd ?? null}
      jiraPosted={epic?.jiraPosted ?? {}}
    />
  );
}

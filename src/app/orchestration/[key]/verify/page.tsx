import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import VerifyView from "@/components/VerifyView";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  if (!epic) notFound();

  return (
    <VerifyView
      epicKey={key}
      title={epic.title ?? null}
      resolved={epic.resolved}
      mode={epic.orchestration?.mode ?? null}
      worktreeRemoved={epic.worktreeRemoved}
      hasJira={!!epic.jiraIssueMd || isJiraIssueKey(key)}
      orderKind={epic.orderKind ?? null}
      runs={epic.runs}
      testGuideMd={epic.testGuideMd}
    />
  );
}

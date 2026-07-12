import { getReportRuns, getIssueStatus } from "@/lib/issues";
import IssueReport from "@/components/IssueReport";

export const dynamic = "force-dynamic";

export default function IssueDetailPage({
  params,
}: {
  params: { key: string };
}) {
  const runs = getReportRuns(params.key);
  const status = getIssueStatus(params.key);
  return <IssueReport issueKey={params.key} runs={runs} status={status} />;
}

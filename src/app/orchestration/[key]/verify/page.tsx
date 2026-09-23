import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import VerifyView from "@/components/VerifyView";
import { summarizeRuns } from "@/lib/testSummary";
import { getMetaDir } from "@/lib/issues";
import path from "node:path";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  if (!epic) notFound();

  // 회차를 전부 모아 한 화면에 — 저장하지 않고 볼 때마다 센다(실측 0~5ms).
  const summary = summarizeRuns(path.join(getMetaDir(), key));

  return (
    <VerifyView
      summary={summary}
      epicKey={key}
      title={epic.title ?? null}
      resolved={epic.resolved}
      mode={epic.orchestration?.mode ?? null}
      worktreeRemoved={epic.worktreeRemoved}
      hasJira={epic.hasJiraDoc || isJiraIssueKey(key)}
      hasDesign={epic?.hasDesignDoc ?? false}
      orderKind={epic.orderKind ?? null}
      runs={epic.runs}
      testGuideMd={epic.testGuideMd}
    />
  );
}

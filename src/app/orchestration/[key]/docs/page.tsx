import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import OtherDocsView from "@/components/OtherDocsView";

export const dynamic = "force-dynamic";

export default async function DocsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  // 본문까지 읽는 유일한 화면이다(보드는 목록만 쓴다 — orchestration.ts readOtherDocs 참고).
  const epic = getEpic(key, { withDocs: true });
  if (!epic) notFound();

  return (
    <OtherDocsView
      epicKey={key}
      title={epic.title ?? null}
      docs={epic.otherDocs}
      mode={epic.orchestration?.mode ?? null}
      worktreeRemoved={epic.worktreeRemoved}
      resolved={epic.resolved}
      hasJira={epic.hasJiraDoc || isJiraIssueKey(key)}
      hasDesign={epic.hasDesignDoc}
      orderKind={epic.orderKind ?? null}
    />
  );
}

import { notFound } from "next/navigation";
import { getEpic } from "@/lib/orchestration";
import { ORDER_KEY_RE, isJiraIssueKey } from "@/lib/keys";
import DeliverablesView from "@/components/DeliverablesView";

export const dynamic = "force-dynamic";

/** 산출물 탭 — 산출자가 켜진 오더의 산출 기록, 올린 곳, 산출물 파일. */
export default async function DeliverablesPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!ORDER_KEY_RE.test(key)) notFound();
  const epic = getEpic(key);
  if (!epic) notFound();

  return (
    <DeliverablesView
      epicKey={key}
      title={epic.title ?? null}
      mode={epic.orchestration?.mode ?? null}
      worktreeRemoved={epic.worktreeRemoved}
      resolved={epic.resolved}
      hasJira={epic.hasJiraDoc || isJiraIssueKey(key)}
      hasDesign={epic.hasDesignDoc}
      hasQa={!!epic.qa}
      orderKind={epic.orderKind ?? null}
      // 산출자가 켜지지 않은 오더는 옛 자리(산출 기록 한 건)만 있다. 주소로 직접 들어와도 보이게 채운다.
      produceDocs={epic.produceDocs.length ? epic.produceDocs : epic.produceMd ? [{ name: "produce.md", content: epic.produceMd }] : []}
      uploads={epic.uploads}
      deliverables={epic.deliverables}
    />
  );
}

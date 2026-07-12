import { listIssues, getIssueTestDir } from "@/lib/issues";
import IssueList from "@/components/IssueList";

// 파일시스템을 매 요청마다 읽도록 캐시 비활성화
export const dynamic = "force-dynamic";

export default function IssueTestPage() {
  const issues = listIssues();
  return <IssueList issues={issues} sourceDir={getIssueTestDir()} />;
}

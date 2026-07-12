/** 이슈 키로 Jira 브라우즈 URL을 만든다. (클라이언트/서버 공용, node 의존 없음) */
export function jiraUrl(key: string): string {
  return `https://wadiz.atlassian.net/browse/${key}`;
}

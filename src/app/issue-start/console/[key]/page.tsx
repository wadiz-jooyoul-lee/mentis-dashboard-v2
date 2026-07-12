import JobConsole from "@/components/JobConsole";

export const dynamic = "force-dynamic";

export default function JobConsolePage({
  params,
}: {
  params: { key: string };
}) {
  return <JobConsole issueKey={params.key} />;
}

import JobConsole from "@/components/JobConsole";

export const dynamic = "force-dynamic";

export default function OrderConsolePage({
  params,
}: {
  params: { key: string };
}) {
  return <JobConsole issueKey={params.key} />;
}

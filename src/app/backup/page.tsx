import { getBackupStatus, listBackups, backupDir } from "@/lib/backup";
import { getOrchestrationBackupStatus } from "@/lib/orchestrationBackup";
import BackupListView from "@/components/BackupListView";
import OrchestrationBackupView from "@/components/OrchestrationBackupView";

export const dynamic = "force-dynamic";

export default function BackupPage() {
  const status = getBackupStatus();
  const { archives, totalBytes, log } = listBackups();
  const orch = getOrchestrationBackupStatus();
  return (
    <>
      <BackupListView
        archives={archives}
        totalBytes={totalBytes}
        log={log}
        status={{ lastBackupAt: status.lastBackupAt, pending: status.pending, running: status.running }}
        dest={backupDir()}
      />
      <OrchestrationBackupView
        archives={orch.archives}
        totalBytes={orch.totalBytes}
        orders={orch.orders}
        missing={orch.missing}
        stale={orch.stale}
        running={orch.running}
        dest={orch.dest}
      />
    </>
  );
}

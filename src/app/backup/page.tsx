import { getBackupStatus, listBackups, backupDir } from "@/lib/backup";
import BackupListView from "@/components/BackupListView";

export const dynamic = "force-dynamic";

export default function BackupPage() {
  const status = getBackupStatus();
  const { archives, totalBytes, log } = listBackups();
  return (
    <BackupListView
      archives={archives}
      totalBytes={totalBytes}
      log={log}
      status={{ lastBackupAt: status.lastBackupAt, pending: status.pending, running: status.running }}
      dest={backupDir()}
    />
  );
}

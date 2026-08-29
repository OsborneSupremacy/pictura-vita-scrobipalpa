import { useState } from 'react';
import { api } from '../api/client';
import { buildExportPayload, exportFileName, serializeExport } from '../api/export';
import type { DayNumber } from '../layout';

interface Props {
  today: DayNumber;
}

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; name: string } | { kind: 'failed'; message: string };

export function ProfileMenu({ today }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const exportData = async () => {
    setStatus({ kind: 'working' });

    try {
      // Every timeline, not just the one being viewed: a backup that silently omits data
      // is worse than no backup.
      const timelines = await api.timelines();
      const text = serializeExport(buildExportPayload(timelines));
      const name = exportFileName(today);

      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setStatus({ kind: 'done', name });
    } catch (problem: unknown) {
      setStatus({
        kind: 'failed',
        message: problem instanceof Error ? problem.message : String(problem)
      });
    }
  };

  return (
    <details className="profile">
      <summary aria-label="Profile and data">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <circle cx="12" cy="8" r="4" fill="currentColor" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="currentColor" />
        </svg>
      </summary>

      <div className="profile-panel">
        <button type="button" onClick={() => void exportData()} disabled={status.kind === 'working'}>
          {status.kind === 'working' ? 'Exporting…' : 'Export all data (.json)'}
        </button>

        <p className="muted">
          Downloads every timeline in the same format as the data file, so a backup can be
          restored by pointing the API at it.
        </p>

        {status.kind === 'done' && <p className="ok">Saved {status.name}</p>}
        {status.kind === 'failed' && <p className="bad">{status.message}</p>}
      </div>
    </details>
  );
}

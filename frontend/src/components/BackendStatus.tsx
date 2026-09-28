import { useEffect, useState } from 'react';
import { fetchHealth } from '../api/client.ts';

type Status = 'checking' | 'online' | 'offline';

const LABELS: Record<Status, string> = {
  checking: 'backend: checking…',
  online: 'backend: online',
  offline: 'backend: offline',
};

export default function BackendStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(() => setStatus('online'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('offline');
      });
    return () => controller.abort();
  }, []);

  return (
    <span className={`backend-status backend-status--${status}`} role="status">
      {LABELS[status]}
    </span>
  );
}

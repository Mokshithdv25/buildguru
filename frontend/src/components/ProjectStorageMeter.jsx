import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProjectStorageUsage, PROJECT_STORAGE_ENABLED } from '../lib/projectStorageApi';

export default function ProjectStorageMeter() {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!PROJECT_STORAGE_ENABLED) return;
    let live = true;
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      try { const result = await getProjectStorageUsage(); if (live && current === generation) { setUsage(result); setError(''); } }
      catch { if (live && current === generation) setError('Storage usage is unavailable. Your allowance is still checked when uploading.'); }
    };
    refresh();
    window.addEventListener('project-storage-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { live = false; window.removeEventListener('project-storage-changed', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  if (!PROJECT_STORAGE_ENABLED) return null;
  const paid = usage && usage.limit_bytes > usage.free_limit_bytes;
  const full = usage && usage.used_bytes >= usage.limit_bytes;
  return <aside style={{ padding: 14, margin: '12px 0 18px', border: '1px solid #E8E4DE', borderRadius: 10, background: '#FBFAF8', fontSize: 13 }} aria-label="Account file storage">
    <strong>{usage ? `${(usage.used_bytes / 1000000).toFixed(1)} MB of ${usage.limit_bytes / 1000000} MB used` : 'Loading storage usage…'}</strong>
    {usage && <progress value={usage.used_bytes} max={usage.limit_bytes} aria-label="Storage used" style={{ display: 'block', width: '100%', margin: '9px 0', accentColor: '#C85F2B' }} />}
    <div style={{ color: '#78716C', marginTop: 5 }}>{paid ? 'Paid storage' : '20 MB free storage'} across all your projects. Up to 15 MB per file.</div>
    {full && <p role="status">Storage full. {paid ? 'Delete files to make room.' : 'Upgrade or delete files to upload more.'} Your saved files remain available.</p>}
    {!paid && <Link to="/subscriptions" style={{ display: 'inline-block', color: '#C85F2B', fontWeight: 700, marginTop: 8 }}>Upgrade for more storage →</Link>}
    {error && <p role="status">{error}</p>}
  </aside>;
}

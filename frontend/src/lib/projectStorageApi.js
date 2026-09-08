import { getSupabase } from './supabaseClient';

const configuredEndpoint = process.env.REACT_APP_PROJECT_STORAGE_URL || '';
const defaultEndpoint = 'https://buildguru-project-storage.mdiggena.workers.dev';
export const PROJECT_STORAGE_ENABLED = Boolean(configuredEndpoint || defaultEndpoint);
const endpoint = (configuredEndpoint || defaultEndpoint).replace(/\/$/, '');
export async function storageRequest(path, options = {}) {
  if (!endpoint) throw new Error('File storage is being set up. Please try again shortly.');
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Sign in to manage your files.');
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${data.session.access_token}` },
  });
  const result = await response.json();
  if (!response.ok) {
    const failure = new Error(result.error || 'Could not complete the file request.');
    failure.code = result.code;
    throw failure;
  }
  return result;
}
export const getProjectStorageUsage = () => storageRequest('/usage');
export function notifyStorageChanged() {
  window.dispatchEvent(new Event('project-storage-changed'));
}

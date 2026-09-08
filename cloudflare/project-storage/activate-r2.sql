-- Run only once the Worker is ready; forces every project-file mutation through quota enforcement.
begin;
revoke insert, update, delete on public.project_documents from authenticated, anon;
drop policy if exists project_documents_storage_insert_own on storage.objects;
drop policy if exists project_documents_storage_update_own on storage.objects;
drop policy if exists project_documents_storage_delete_own on storage.objects;
commit;

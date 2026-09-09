-- Keep generated v0 design assets visible in the project document vault.
-- The document row is an index entry; the bytes remain in the private
-- project-v0 bucket and are not copied into project-documents.
alter table public.project_documents
  add column if not exists source_type text not null default 'uploaded';

create unique index if not exists project_documents_project_source_path_key
  on public.project_documents (project_id, source_type, storage_path);

create index if not exists project_documents_source_type_idx
  on public.project_documents (project_id, source_type, created_at desc);

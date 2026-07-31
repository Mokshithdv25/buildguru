-- BuildGuru: STRICT RLS for project v0 (optional — only if you use owner-scoped RLS)
-- If you disabled RLS on projects (MVP scripts), use db/buildguru_supabase_align.sql instead.
-- Run in Supabase SQL editor after core project_* tables exist.

CREATE TABLE IF NOT EXISTS public.project_v0_packs (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  images_json JSONB,
  floor_plans_json JSONB,
  estimate_json JSONB,
  is_mock BOOLEAN NOT NULL DEFAULT false,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_v0_packs_generated_at_idx
  ON public.project_v0_packs (generated_at DESC);

-- Optional: scope projects to auth user (skip if column already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'owner_user_id'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN owner_user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

COMMENT ON TABLE public.project_v0_packs IS 'AI v0 image bundle + estimate/milestones JSON per project';

-- Row-level security: each homeowner sees only their projects (and child rows).
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_v0_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.project_owned_by_user(pid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pid AND p.owner_user_id = auth.uid()
  );
$$;

-- Projects: read/write own; insert may start with null owner then claim on login
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "projects_insert_auth" ON public.projects;
CREATE POLICY "projects_insert_auth" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id IS NULL OR owner_user_id = auth.uid());

DROP POLICY IF EXISTS "projects_update_own_or_claim" ON public.projects;
CREATE POLICY "projects_update_own_or_claim" ON public.projects
  FOR UPDATE TO authenticated
  USING (owner_user_id IS NULL OR owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Child tables: access via project ownership
DROP POLICY IF EXISTS "project_briefs_via_project" ON public.project_briefs;
CREATE POLICY "project_briefs_via_project" ON public.project_briefs
  FOR ALL TO authenticated
  USING (public.project_owned_by_user(project_id))
  WITH CHECK (public.project_owned_by_user(project_id));

DROP POLICY IF EXISTS "project_v0_packs_via_project" ON public.project_v0_packs;
CREATE POLICY "project_v0_packs_via_project" ON public.project_v0_packs
  FOR ALL TO authenticated
  USING (public.project_owned_by_user(project_id))
  WITH CHECK (public.project_owned_by_user(project_id));

DROP POLICY IF EXISTS "project_stages_via_project" ON public.project_stages;
CREATE POLICY "project_stages_via_project" ON public.project_stages
  FOR ALL TO authenticated
  USING (public.project_owned_by_user(project_id))
  WITH CHECK (public.project_owned_by_user(project_id));

DROP POLICY IF EXISTS "project_tasks_via_project" ON public.project_tasks;
CREATE POLICY "project_tasks_via_project" ON public.project_tasks
  FOR ALL TO authenticated
  USING (public.project_owned_by_user(project_id))
  WITH CHECK (public.project_owned_by_user(project_id));

DROP POLICY IF EXISTS "project_messages_via_project" ON public.project_messages;
CREATE POLICY "project_messages_via_project" ON public.project_messages
  FOR ALL TO authenticated
  USING (public.project_owned_by_user(project_id))
  WITH CHECK (public.project_owned_by_user(project_id));

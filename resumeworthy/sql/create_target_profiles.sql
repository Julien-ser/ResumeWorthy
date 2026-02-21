create table if not exists public.target_profiles (
  user_id uuid primary key,
  target_role text not null default '',
  target_company text not null default '',
  job_description text not null default '',
  extra_context text not null default '',
  links text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.set_target_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_target_profiles_updated_at on public.target_profiles;
create trigger trg_target_profiles_updated_at
before update on public.target_profiles
for each row
execute function public.set_target_profiles_updated_at();

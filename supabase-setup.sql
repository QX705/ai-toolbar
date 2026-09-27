-- =========================================================
-- AI 工具栏 · Supabase 初始化脚本
-- 使用方法：
--   1. 打开 https://supabase.com/dashboard 进入你的项目
--   2. 左侧菜单 → SQL Editor → New query
--   3. 把本文件全部内容粘贴进去，点 Run 运行（只需运行一次）
-- =========================================================

-- 1. 工具表：每个登录用户自己的工具列表
create table if not exists public.tools (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  url        text not null,
  category   text not null default '其他',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- 2. 笔记表：每个用户一条可编辑文本
create table if not exists public.notes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now()
);

-- 3. 开启行级安全（RLS）：每个人只能读写自己的数据
alter table public.tools enable row level security;
alter table public.notes enable row level security;

drop policy if exists "用户管理自己的工具" on public.tools;
create policy "用户管理自己的工具" on public.tools
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "用户管理自己的笔记" on public.notes;
create policy "用户管理自己的笔记" on public.notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. 地点表：地图上标记的地点 + 攻略 + 图片链接
create table if not exists public.places (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  lng        double precision not null,
  lat        double precision not null,
  guide      text not null default '',
  photos     text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.places enable row level security;

drop policy if exists "用户管理自己的地点" on public.places;
create policy "用户管理自己的地点" on public.places
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. 图片存储桶（公开读、仅本人写自己文件夹）
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

drop policy if exists "用户管理自己的景点图片" on storage.objects;
create policy "用户管理自己的景点图片" on storage.objects
  for all
  using (bucket_id = 'place-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'place-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- 6. 攻略表：每个地点下，所有用户都可以读，写的人各自管理自己的条目
create table if not exists public.place_guides (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  place_id     uuid not null references public.places(id) on delete cascade,
  author_email text not null default '',
  content      text not null default '',
  photos       text[] not null default '{}',
  created_at   timestamptz not null default now()
);

alter table public.place_guides enable row level security;

drop policy if exists "所有人可读攻略" on public.place_guides;
create policy "所有人可读攻略" on public.place_guides
  for select using (true);

drop policy if exists "用户发表自己的攻略" on public.place_guides;
create policy "用户发表自己的攻略" on public.place_guides
  for insert with check (auth.uid() = user_id);

drop policy if exists "用户删除自己的攻略" on public.place_guides;
create policy "用户删除自己的攻略" on public.place_guides
  for delete using (auth.uid() = user_id);

-- 地点所有人可读（别人的标记也能看到）
drop policy if exists "所有人可读地点" on public.places;
create policy "所有人可读地点" on public.places
  for select using (true);

-- 7. 旧数据迁移：把原来存在 places 表里的攻略/照片搬进 place_guides（只搬一次）
insert into public.place_guides (user_id, place_id, author_email, content, photos, created_at)
select p.user_id, p.id, coalesce(u.email, ''), p.guide, p.photos, p.created_at
from public.places p
left join auth.users u on u.id = p.user_id
where (p.guide <> '' or array_length(p.photos, 1) > 0)
  and not exists (select 1 from public.place_guides g where g.place_id = p.id and g.user_id = p.user_id);

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

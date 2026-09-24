// =========================================================
// AI 工具栏 —— 数据、账号与云端同步逻辑
// 未登录：数据存浏览器 localStorage
// 登录后：工具与笔记同步到 Supabase，换设备不丢
// 注意：SDK 全局变量叫 supabase（var 声明），这里必须用别的名字
// =========================================================

const STORAGE_KEY = "ai-toolbar-tools";
const NOTE_KEY = "ai-toolbar-note";

const CATEGORIES = ["AI工具", "编程开发", "图标制作", "学习插件", "游戏官网", "其他"];

// 预置工具（未登录时的默认列表，登录后首次同步会复制到你的云端账号）
const DEFAULT_TOOLS = [
    // AI 工具
    { id: 1,  name: "豆包",                 url: "https://www.doubao.com",                        category: "AI工具" },
    { id: 2,  name: "deepseek",             url: "https://chat.deepseek.com",                    category: "AI工具" },
    { id: 3,  name: "即梦",                 url: "https://jimeng.jianying.com",                   category: "AI工具" },
    { id: 4,  name: "智谱",                 url: "https://zcode.z.ai/cn",                         category: "AI工具" },

    // 编程开发工具
    { id: 5,  name: "力扣",                 url: "https://leetcode.cn",                            category: "编程开发" },
    { id: 6,  name: "牛客网",               url: "https://www.nowcoder.com",                       category: "编程开发" },
    { id: 7,  name: "CSDN",                 url: "https://www.csdn.net",                           category: "编程开发" },
    { id: 8,  name: "GitHub",               url: "https://github.com",                             category: "编程开发" },
    { id: 9,  name: "Qt center",            url: "https://download.qt.io",                         category: "编程开发" },
    { id: 10, name: "嘉立创EDA客户中心",     url: "https://member.jlc.com",                          category: "编程开发" },

    // 图标制作
    { id: 11, name: "ICO图标生成",          url: "https://www.icoa.cc",                            category: "图标制作" },
    { id: 12, name: "阿里巴巴矢量图",       url: "https://www.iconfont.cn",                         category: "图标制作" },

    // 学习插件
    { id: 13, name: "软仓",                 url: "https://ruancang.net",                            category: "学习插件" },
    { id: 14, name: "凹凸工坊",             url: "https://www.autohanding.com",                     category: "学习插件" },
    { id: 15, name: "iLovePDF",             url: "https://www.ilovepdf.com",                        category: "学习插件" },
    { id: 16, name: "TinyPNG",              url: "https://tinypng.com",                              category: "学习插件" },
    
    // 游戏官网（Mod）
    { id: 17, name: "人类一败涂地",         url: "https://gaming.lenovo.com/human-fall-flat",         category: "游戏官网" },
    { id: 18, name: "科雷",                 url: "https://accounts.klei.com",                         category: "游戏官网" },
    { id: 19, name: "BongoCat_Mod",         url: "https://xv40.lanzouu.com/b0fpy9v9e",                category: "游戏官网" },
    
    // 其他
    { id: 20, name: "金数据",               url: "https://jinshuju.net",                             category: "其他" },
    { id: 21, name: "Supabase",             url: "https://supabase.com",                             category: "其他" },
    { id: 22, name: "全民简历",             url: "https://www.qmjianli.com",                        category: "其他" },
    { id: 23, name: "Maker World",          url: "https://makerworld.com.cn",                        category: "其他" },
];

// ===== 云端初始化（config.js 未填 key 时自动退回纯本地模式） =====
// SDK 按需异步加载：CDN 不通或超时不阻塞页面，照常本地使用
let supabaseClient = null;   // Supabase 客户端，SDK 就绪后赋值
let cloudReady = false;      // 云端功能是否可用

const SUPABASE_CDNS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://esm.sh/@supabase/supabase-js@2",
];

function importWithTimeout(url, ms = 8000) {
  return Promise.race([
    import(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error("SDK 加载超时")), ms)),
  ]);
}

async function initCloud() {
  if (typeof SUPABASE_URL !== "string" || !SUPABASE_URL.startsWith("https://")) return;
  if (typeof SUPABASE_ANON_KEY !== "string" || SUPABASE_ANON_KEY.length <= 20) return;

  let mod = null;
  for (const url of SUPABASE_CDNS) {
    try {
      mod = await importWithTimeout(url);
      break;
    } catch (e) {
      console.warn("Supabase SDK 加载失败，尝试下一个源：" + url);
    }
  }
  if (!mod || typeof mod.createClient !== "function") {
    console.warn("Supabase SDK 不可用（CDN 均失败），本次使用本地模式");
    return;
  }

  supabaseClient = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  cloudReady = true;
  updateAuthUI();

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
      handleSignedIn(session.user);
    } else if (event === "SIGNED_OUT") {
      handleSignedOut();
    }
  });
}

// ===== 数据读写（本地缓存层） =====
function loadTools() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // 数据损坏时回退到默认
  }
  return [...DEFAULT_TOOLS];
}

function saveTools() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
}

// ===== 状态 =====
let tools = loadTools();
let activeCategory = "全部";
let keyword = "";
let editingId = null;      // 正在编辑的工具 id，null 表示新增
let currentUser = null;    // Supabase 登录用户
let localBackup = null;    // 登录前的本地数据快照，退出登录时还原
let authMode = "login";    // 登录弹窗当前模式
let syncing = false;
let syncFailCount = 0;     // 连续同步失败次数（用于自愈重试与强制重登）

// ===== 工具函数 =====
// 根据名称生成稳定的头像底色
const AVATAR_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

function avatarColor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normUrlKey(url) {
  return url.replace(/\/+$/, "").toLowerCase();
}

// 补全协议并校验网址，非法时返回 null
function normalizeUrl(input) {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// 网站图标候选源：优先站点自身的 favicon.ico（国内可直连），失败依次换备用源
function iconSources(url) {
  let origin = "";
  let host = "";
  try {
    const u = new URL(url);
    origin = u.origin;
    host = u.hostname;
  } catch {
    return [];
  }
  return [
    origin + "/favicon.ico",
    "https://favicon.im/" + host + "?larger=true",
    "https://api.iowen.cn/favicon/" + host + ".png",
  ];
}

// 把 Supabase 的报错翻译成中文
function extractErrMsg(e) {
  const raw = (e && (e.message || e.error_description || e.msg)) || String(e);
  const map = [
    ["Invalid login credentials", "邮箱或密码错误"],
    ["Email not confirmed", "请先到邮箱点击确认链接，再回来登录"],
    ["User already registered", "该邮箱已被注册，请直接登录"],
    ["at least 6 characters", "密码至少 6 位"],
    ["different from the old password", "新密码不能与旧密码相同"],
    ["rate limit", "操作太频繁，请稍后再试"],
    ["Failed to fetch", "无法连接云端服务，请检查网络"],
    ["Invalid API key", "云端密钥配置错误（请检查 config.js 中的 anon key）"],
    ["does not exist", "数据表不存在：请先在 Supabase SQL Editor 运行 supabase-setup.sql"],
    ["row-level security", "权限不足：请确认已在 Supabase 运行 supabase-setup.sql"],
    ["validated against", "邮箱格式不正确"],
  ];
  for (const [k, v] of map) if (raw && raw.includes(k)) return v;
  return raw;
}

// ===== DOM 引用 =====
const toolSections = document.getElementById("toolSections");
const categoryBar = document.getElementById("categoryBar");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");

const userArea = document.getElementById("userArea");
const loginBtn = document.getElementById("loginBtn");
const userChip = document.getElementById("userChip");
const userEmail = document.getElementById("userEmail");

const notesPanel = document.getElementById("notesPanel");
const notesToggle = document.getElementById("notesToggle");
const noteText = document.getElementById("noteText");
const noteStatus = document.getElementById("noteStatus");

const modalMask = document.getElementById("modalMask");
const modalTitle = document.getElementById("modalTitle");
const toolForm = document.getElementById("toolForm");
const toolName = document.getElementById("toolName");
const toolUrl = document.getElementById("toolUrl");
const toolCategory = document.getElementById("toolCategory");
const formError = document.getElementById("formError");

const authMask = document.getElementById("authMask");
const authTitle = document.getElementById("authTitle");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authError = document.getElementById("authError");
const authSubmit = document.getElementById("authSubmit");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");

const pwMask = document.getElementById("pwMask");
const pwForm = document.getElementById("pwForm");
const pwNew = document.getElementById("pwNew");
const pwError = document.getElementById("pwError");

// ===== 渲染 =====
function visibleTools() {
  return tools.filter((t) => {
    const matchCat = activeCategory === "全部" || t.category === activeCategory;
    const kw = keyword.trim().toLowerCase();
    const matchKw =
      !kw ||
      t.name.toLowerCase().includes(kw) ||
      t.url.toLowerCase().includes(kw);
    return matchCat && matchKw;
  });
}

function renderCategories() {
  categoryBar.innerHTML = "";
  ["全部", ...CATEGORIES].forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      activeCategory = cat;
      renderCategories();
      renderGrid();
    });
    categoryBar.appendChild(btn);
  });
}

function buildCard(tool) {
  const card = document.createElement("div");
  card.className = "tool-card";
  card.title = tool.url;

  // 点击卡片：新标签页打开网址
  card.addEventListener("click", () => {
    window.open(tool.url, "_blank", "noopener");
  });

  const initial = [...tool.name][0].toUpperCase();

  card.innerHTML = `
    <div class="tool-actions">
      <button class="act-btn edit" title="编辑">✏️</button>
      <button class="act-btn danger" title="删除">🗑️</button>
    </div>
    <div class="tool-head">
      <div class="tool-avatar" style="background:${avatarColor(tool.name)}"><span class="avatar-letter">${initial}</span><img class="tool-icon" alt="" referrerpolicy="no-referrer"></div>
      <div style="min-width:0">
        <div class="tool-name">${escapeHtml(tool.name)}</div>
        <div class="tool-domain">${escapeHtml(domainOf(tool.url))}</div>
      </div>
    </div>
    <span class="tool-cat">${escapeHtml(tool.category)}</span>
  `;

  // 网站图标：逐个候选源尝试（8 秒超时强制换源），全部失败则保留字母头像
  const iconImg = card.querySelector(".tool-icon");
  const sources = iconSources(tool.url);
  let sourceIdx = 0;
  let iconTimer = null;
  const tryNextSource = () => {
    clearTimeout(iconTimer);
    sourceIdx++;
    if (sourceIdx < sources.length) {
      iconImg.src = sources[sourceIdx];
      iconTimer = setTimeout(tryNextSource, 8000);
    } else {
      iconImg.remove();
    }
  };
  iconImg.addEventListener("load", () => { clearTimeout(iconTimer); iconImg.classList.add("loaded"); });
  iconImg.addEventListener("error", tryNextSource);
  if (sources.length > 0) {
    iconImg.src = sources[0];
    iconTimer = setTimeout(tryNextSource, 8000);
  } else iconImg.remove();

  // 编辑 / 删除（阻止冒泡，避免触发打开链接）
  card.querySelector(".edit").addEventListener("click", (e) => {
    e.stopPropagation();
    openModal(tool);
  });
  card.querySelector(".danger").addEventListener("click", (e) => {
    e.stopPropagation();
    removeTool(tool);
  });

  return card;
}

function renderGrid() {
  const list = visibleTools();
  const wrap = document.getElementById("toolSections");
  wrap.innerHTML = "";
  emptyState.hidden = list.length > 0;

  // 按分类分组
  const groups = new Map();
  list.forEach((t) => {
    const cat = t.category || "其他";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(t);
  });

  // 按 CATEGORIES 定义的顺序输出分组，未定义的分类排最后
  const ordered = [
    ...CATEGORIES.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !CATEGORIES.includes(c)),
  ];

  ordered.forEach((cat) => {
    const section = document.createElement("section");
    section.className = "tool-section";

    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = cat;
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "tool-grid";
    groups.get(cat).forEach((tool) => grid.appendChild(buildCard(tool)));
    section.appendChild(grid);

    wrap.appendChild(section);
  });
}

// ===== 工具增删改（登录时同步云端） =====
async function addTool(name, url, category) {
  if (currentUser && supabaseClient) {
    const { data, error } = await supabaseClient
      .from("tools")
      .insert({ user_id: currentUser.id, name, url, category, sort: tools.length })
      .select()
      .single();
    if (error) throw error;
    tools.push(data);
  } else {
    tools.push({ id: Date.now(), name, url, category });
  }
  saveTools();
}

async function updateTool(tool, name, url, category) {
  if (currentUser && supabaseClient) {
    const { error } = await supabaseClient
      .from("tools")
      .update({ name, url, category })
      .eq("id", tool.id);
    if (error) throw error;
  }
  tool.name = name;
  tool.url = url;
  tool.category = category;
  saveTools();
}

async function deleteTool(tool) {
  if (currentUser && supabaseClient) {
    const { error } = await supabaseClient.from("tools").delete().eq("id", tool.id);
    if (error) throw error;
  }
  tools = tools.filter((t) => t.id !== tool.id);
  saveTools();
}

function removeTool(tool) {
  if (!confirm(`确定删除「${tool.name}」吗？`)) return;
  deleteTool(tool)
    .then(renderGrid)
    .catch((e) => alert("删除失败：" + extractErrMsg(e)));
}

// ===== 添加 / 编辑 弹窗 =====
function fillCategorySelect(selected) {
  toolCategory.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    opt.selected = cat === selected;
    toolCategory.appendChild(opt);
  });
}

function openModal(tool = null) {
  editingId = tool ? tool.id : null;
  modalTitle.textContent = tool ? "编辑工具" : "添加工具";
  toolName.value = tool ? tool.name : "";
  toolUrl.value = tool ? tool.url : "";
  fillCategorySelect(tool ? tool.category : activeCategory === "全部" ? "其他" : activeCategory);
  formError.textContent = "";
  modalMask.hidden = false;
  toolName.focus();
}

function closeModal() {
  modalMask.hidden = true;
  editingId = null;
}

document.getElementById("addBtn").addEventListener("click", () => openModal());
document.getElementById("cancelBtn").addEventListener("click", closeModal);
modalMask.addEventListener("click", (e) => {
  if (e.target === modalMask) closeModal();
});

toolForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = toolName.value.trim();
  const url = normalizeUrl(toolUrl.value);

  if (!name) return;
  if (!url) {
    formError.textContent = "网址格式不正确，请检查后重试";
    return;
  }

  const saveBtn = document.getElementById("saveToolBtn");
  saveBtn.disabled = true;

  const finish = () => {
    saveBtn.disabled = false;
    closeModal();
    renderGrid();
  };

  let action;
  if (editingId !== null) {
    const tool = tools.find((t) => t.id === editingId);
    if (!tool) { saveBtn.disabled = false; return; }
    action = updateTool(tool, name, url, toolCategory.value);
  } else {
    action = addTool(name, url, toolCategory.value);
  }

  action.then(finish).catch((err) => {
    saveBtn.disabled = false;
    formError.textContent = "保存失败：" + extractErrMsg(err);
  });
});

// ===== 搜索 =====
searchInput.addEventListener("input", (e) => {
  keyword = e.target.value;
  renderGrid();
});

// =========================================================
// 笔记：本地始终保存；登录后同时同步云端
// =========================================================
let noteSaveTimer = null;

function setNoteStatus(text) {
  noteStatus.textContent = text;
}

function saveNoteLocal() {
  localStorage.setItem(NOTE_KEY, noteText.value);
}

function saveNote() {
  saveNoteLocal();
  if (!currentUser || !supabaseClient) {
    setNoteStatus("已保存到本地 ✓");
    return;
  }
  setNoteStatus("正在同步到云端…");
  supabaseClient
    .from("notes")
    .upsert({ user_id: currentUser.id, content: noteText.value, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      setNoteStatus(error ? "云同步失败：" + extractErrMsg(error) : "已保存并同步到云端 ✓");
    });
}

noteText.addEventListener("input", () => {
  setNoteStatus("编辑中…");
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(saveNote, 600);
});

notesToggle.addEventListener("click", () => {
  const open = notesPanel.hidden;
  notesPanel.hidden = !open;
  notesToggle.classList.toggle("active", open);
  if (open) noteText.focus();
});

// =========================================================
// 账号：登录 / 注册 / 修改密码 / 退出
// =========================================================
function updateAuthUI() {
  if (!cloudReady) {
    userArea.hidden = true;
    return;
  }
  userArea.hidden = false;
  const loggedIn = !!currentUser;
  loginBtn.hidden = loggedIn;
  userChip.hidden = !loggedIn;
  userEmail.textContent = loggedIn ? currentUser.email : "";
  userEmail.title = loggedIn ? currentUser.email : "";
}

function openAuth(mode) {
  authMode = mode;
  authTitle.textContent = mode === "login" ? "登录" : "注册新账号";
  authSubmit.textContent = mode === "login" ? "登录" : "注册";
  tabLogin.classList.toggle("active", mode === "login");
  tabRegister.classList.toggle("active", mode === "register");
  authError.textContent = "";
  authError.classList.remove("ok");
  authMask.hidden = false;
  authEmail.focus();
}

function closeAuth() {
  authMask.hidden = true;
}

loginBtn.addEventListener("click", () => openAuth("login"));
document.getElementById("authCancel").addEventListener("click", closeAuth);
authMask.addEventListener("click", (e) => {
  if (e.target === authMask) closeAuth();
});

tabLogin.addEventListener("click", () => openAuth("login"));
tabRegister.addEventListener("click", () => openAuth("register"));

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value;
  authError.classList.remove("ok");
  authError.textContent = "";
  authSubmit.disabled = true;

  try {
    if (authMode === "login") {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAuth(); // 登录成功，SIGNED_IN 事件会触发后续同步
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        closeAuth(); // 邮箱确认已关闭：直接登录成功
      } else {
        authError.classList.add("ok");
        authError.textContent = "注册成功！请先到邮箱点击确认链接，再回来登录。";
      }
    }
  } catch (err) {
    authError.textContent = extractErrMsg(err);
  } finally {
    authSubmit.disabled = false;
  }
});

// 修改密码
document.getElementById("changePwBtn").addEventListener("click", () => {
  pwNew.value = "";
  pwError.textContent = "";
  pwMask.hidden = false;
  pwNew.focus();
});
document.getElementById("pwCancel").addEventListener("click", () => {
  pwMask.hidden = true;
});
pwMask.addEventListener("click", (e) => {
  if (e.target === pwMask) pwMask.hidden = true;
});

pwForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  pwError.textContent = "";
  try {
    const { error } = await supabaseClient.auth.updateUser({ password: pwNew.value });
    if (error) throw error;
    pwMask.hidden = true;
    alert("密码修改成功");
  } catch (err) {
    pwError.textContent = extractErrMsg(err);
  }
});

// 退出登录
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut(); // SIGNED_OUT 事件负责还原本地数据
});

// ===== 登录后的云端同步 =====
function handleSignedIn(user) {
  if (syncing || (currentUser && currentUser.id === user.id)) return;
  syncing = true;
  currentUser = user;
  updateAuthUI();

  // 快照登录前的本地数据，退出登录时还原
  localBackup = { tools: tools.slice(), note: localStorage.getItem(NOTE_KEY) || "" };

  syncOnLogin()
    .then(() => { syncFailCount = 0; })
    .catch((e) => {
      // 静默自愈：Supabase 平台有"刷新令牌被拒"的间歇性故障，自动重试直到恢复
      syncing = false;
      syncFailCount++;
      setTimeout(retrySyncLoop, 10000 * syncFailCount);
    });
}

// 同步失败后的自愈循环：每轮间隔递增；连续 5 次失败则清理坏会话并要求重新登录
async function retrySyncLoop() {
  if (!currentUser || !supabaseClient || syncing) return;
  syncing = true;
  try {
    await syncOnLogin();
    syncFailCount = 0;
    syncing = false;
  } catch (e) {
    syncing = false;
    syncFailCount++;
    if (syncFailCount >= 5) {
      await supabaseClient.auth.signOut(); // 触发 SIGNED_OUT，清掉坏会话
      alert("云端同步连续失败，已自动退出登录（可能是 Supabase 平台故障，status.supabase.com 可查进度）。\n\n请稍后重新登录，即可拿到新的长效令牌恢复正常。");
      return;
    }
    setTimeout(retrySyncLoop, 15000 * syncFailCount);
  }
}

function handleSignedOut() {
  currentUser = null;
  syncing = false;
  syncFailCount = 0;
  if (localBackup) {
    tools = localBackup.tools;
    noteText.value = localBackup.note;
    saveTools();
    saveNoteLocal();
    localBackup = null;
  }
  setNoteStatus("");
  updateAuthUI();
  renderCategories();
  renderGrid();
}

async function syncOnLogin() {
  // 确保登录凭据已附着到客户端，避免竞态导致插入被 RLS 误判为匿名写入
  await supabaseClient.auth.getSession();

  // 带重试的上传：Supabase 平台存在"刷新后 JWT 被拒"的已知故障，
  // 失败时先刷新会话令牌再等 2 秒重试，共 3 次
  async function uploadRows(rows) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabaseClient.from("tools").insert(rows).select();
      if (!error) return data;
      lastErr = error;
      try {
        await supabaseClient.auth.refreshSession();
      } catch (e) { /* 刷新失败不影响下一轮重试 */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw lastErr;
  }

  // 1. 拉取云端工具列表
  const { data: cloud, error } = await supabaseClient
    .from("tools")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const cloudKeys = new Set(cloud.map((t) => normUrlKey(t.url)));

  if (cloud.length === 0 && tools.length > 0) {
    // 2. 云端为空：把当前本地列表（含自定义）整体上传
    const rows = tools.map((t, i) => ({ user_id: currentUser.id, name: t.name, url: t.url, category: t.category, sort: i }));
    tools = await uploadRows(rows);
  } else if (cloud.length > 0) {
    // 3. 合并：本地有、云端没有的上传；结果以云端为准
    const extra = tools.filter((t) => !cloudKeys.has(normUrlKey(t.url)));
    if (extra.length > 0) {
      const rows = extra.map((t, i) => ({ user_id: currentUser.id, name: t.name, url: t.url, category: t.category, sort: cloud.length + i }));
      const inserted = await uploadRows(rows);
      cloud.push(...inserted);
    }
    tools = cloud;
  }

  saveTools();

  // 4. 笔记：云端有就用云端的，否则把本地笔记上传
  const { data: noteRow } = await supabaseClient
    .from("notes")
    .select("content")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (noteRow && noteRow.content) {
    noteText.value = noteRow.content;
    saveNoteLocal();
  } else if (noteText.value.trim()) {
    await supabaseClient
      .from("notes")
      .upsert({ user_id: currentUser.id, content: noteText.value, updated_at: new Date().toISOString() });
  }

  renderCategories();
  renderGrid();
}

// ===== 启动云端（异步，不阻塞本地功能） =====
initCloud();

// ===== 恢复默认工具列表 =====
// 浏览器里存过旧列表时会遮住代码里的 DEFAULT_TOOLS，用它一键刷回默认
document.getElementById("resetBtn").addEventListener("click", async () => {
  if (!confirm("确定恢复默认工具列表吗？当前列表（含你自己添加的）会被覆盖。")) return;

  if (currentUser && supabaseClient) {
    // 登录中：同步删掉云端全部工具，再上传默认列表
    try {
      const ids = tools.map((t) => t.id);
      if (ids.length > 0) {
        const { error } = await supabaseClient.from("tools").delete().in("id", ids);
        if (error) throw error;
      }
      const rows = DEFAULT_TOOLS.map((t, i) => ({ user_id: currentUser.id, name: t.name, url: t.url, category: t.category, sort: i }));
      const { data, error } = await supabaseClient.from("tools").insert(rows).select();
      if (error) throw error;
      tools = data;
    } catch (e) {
      alert("恢复失败：" + extractErrMsg(e));
      return;
    }
  } else {
    tools = [...DEFAULT_TOOLS];
  }

  saveTools();
  activeCategory = "全部";
  renderCategories();
  renderGrid();
});

// ===== 全局快捷键 =====
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!modalMask.hidden) closeModal();
    if (!authMask.hidden) closeAuth();
    if (!pwMask.hidden) pwMask.hidden = true;
  }
});

// ===== 初始化 =====
noteText.value = localStorage.getItem(NOTE_KEY) || "";
setNoteStatus(currentUser ? "已同步到云端 ✓" : "已保存到本地 ✓");
updateAuthUI();
renderCategories();
renderGrid();
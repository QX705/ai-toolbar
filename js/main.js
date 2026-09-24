// =========================================================
// AI 工具栏 —— 数据与逻辑
// 工具数据保存在浏览器 localStorage，键名 ai-toolbar-tools
// =========================================================

const STORAGE_KEY = "ai-toolbar-tools";

const CATEGORIES = ["对话助手", "图像创作", "编程开发", "办公学习", "其他"];

// 预置工具（可在页面上编辑或删除）
const DEFAULT_TOOLS = [
  { id: 1,  name: "DeepSeek",     url: "https://chat.deepseek.com",      category: "对话助手" },
  { id: 2,  name: "Kimi",         url: "https://kimi.moonshot.cn",       category: "对话助手" },
  { id: 3,  name: "通义千问",      url: "https://tongyi.aliyun.com",      category: "对话助手" },
  { id: 4,  name: "豆包",          url: "https://www.doubao.com",         category: "对话助手" },
  { id: 5,  name: "智谱清言",      url: "https://chatglm.cn",             category: "对话助手" },
  { id: 6,  name: "ChatGPT",      url: "https://chat.openai.com",        category: "对话助手" },
  { id: 7,  name: "Claude",       url: "https://claude.ai",              category: "对话助手" },
  { id: 8,  name: "即梦",          url: "https://jimeng.jianying.com",    category: "图像创作" },
  { id: 9,  name: "Midjourney",   url: "https://www.midjourney.com",     category: "图像创作" },
  { id: 10, name: "LiblibAI",     url: "https://www.liblib.art",         category: "图像创作" },
  { id: 11, name: "Cursor",       url: "https://cursor.com",             category: "编程开发" },
  { id: 12, name: "GitHub Copilot", url: "https://github.com/features/copilot", category: "编程开发" },
  { id: 13, name: "v0",           url: "https://v0.dev",                 category: "编程开发" },
  { id: 14, name: "Gamma",        url: "https://gamma.app",              category: "办公学习" },
  { id: 15, name: "秘塔AI搜索",    url: "https://metaso.cn",              category: "办公学习" },
];

// ===== 数据读写 =====
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
let editingId = null; // 正在编辑的工具 id，null 表示新增

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

// ===== 渲染 =====
const grid = document.getElementById("toolGrid");
const categoryBar = document.getElementById("categoryBar");
const emptyState = document.getElementById("emptyState");

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

function renderGrid() {
  const list = visibleTools();
  grid.innerHTML = "";
  emptyState.hidden = list.length > 0;

  list.forEach((tool) => {
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
        <div class="tool-avatar" style="background:${avatarColor(tool.name)}">${initial}</div>
        <div style="min-width:0">
          <div class="tool-name">${escapeHtml(tool.name)}</div>
          <div class="tool-domain">${escapeHtml(domainOf(tool.url))}</div>
        </div>
      </div>
      <span class="tool-cat">${escapeHtml(tool.category)}</span>
    `;

    // 编辑 / 删除（阻止冒泡，避免触发打开链接）
    card.querySelector(".edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openModal(tool);
    });
    card.querySelector(".danger").addEventListener("click", (e) => {
      e.stopPropagation();
      removeTool(tool);
    });

    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function removeTool(tool) {
  if (!confirm(`确定删除「${tool.name}」吗？`)) return;
  tools = tools.filter((t) => t.id !== tool.id);
  saveTools();
  renderGrid();
}

// ===== 弹窗 =====
const modalMask = document.getElementById("modalMask");
const modalTitle = document.getElementById("modalTitle");
const toolForm = document.getElementById("toolForm");
const toolName = document.getElementById("toolName");
const toolUrl = document.getElementById("toolUrl");
const toolCategory = document.getElementById("toolCategory");
const formError = document.getElementById("formError");

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
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalMask.hidden) closeModal();
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

  if (editingId !== null) {
    const tool = tools.find((t) => t.id === editingId);
    if (tool) {
      tool.name = name;
      tool.url = url;
      tool.category = toolCategory.value;
    }
  } else {
    tools.push({
      id: Date.now(),
      name,
      url,
      category: toolCategory.value,
    });
  }

  saveTools();
  closeModal();
  renderGrid();
});

// ===== 搜索 =====
document.getElementById("searchInput").addEventListener("input", (e) => {
  keyword = e.target.value;
  renderGrid();
});

// ===== 初始化 =====
renderCategories();
renderGrid();

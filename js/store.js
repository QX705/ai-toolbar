import { CATEGORIES, DEFAULT_TOOLS } from "./content.js?v=1.0.12";

export { CATEGORIES, DEFAULT_TOOLS };

// =========================================================
// store.js —— 全局状态 + 通用工具函数
// 所有模块共享的状态都放在 App 对象里
// =========================================================

export const STORAGE_KEY = "ai-toolbar-tools";
export const NOTE_KEY = "ai-toolbar-note";

// 全局共享状态
export const App = {
    tools: [],
    activeCategory: "全部",
    keyword: "",
    editingId: null,
    currentUser: null,      // Supabase 登录用户
    supabaseClient: null,   // SDK 就绪后赋值
    cloudReady: false,
    localBackup: null,      // 登录前的本地数据快照
    syncing: false,
    syncFailCount: 0,
    places: [],             // 已保存的地点（云端）
};

// ===== 工具函数 =====

// 根据名称生成稳定的头像底色
const AVATAR_COLORS = [
    "#6366f1", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

export function avatarColor(name) {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function domainOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

export function normUrlKey(url) {
    return url.replace(/\/+$/, "").toLowerCase();
}

// 补全协议并校验网址，非法时返回 null
export function normalizeUrl(input) {
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

export function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// 把 Supabase 的报错翻译成中文
export function extractErrMsg(e) {
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
        ["does not exist", "数据表还没创建：请在 Supabase 运行一次 supabase-setup.sql"],
        ["Could not find the table", "数据表还没创建：请在 Supabase 运行一次 supabase-setup.sql"],
        ["schema cache", "数据表还没创建：请在 Supabase 运行一次 supabase-setup.sql"],
        ["row-level security", "权限不足：请确认已在 Supabase 运行 supabase-setup.sql"],
        ["validated against", "邮箱格式不正确"],
    ];
    for (const [k, v] of map) if (raw && raw.includes(k)) return v;
    return raw;
}

// 网站图标候选源：优先站点自身 favicon.ico，失败依次换备用源
export function iconSources(url) {
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

// ===== 本地持久化 =====
export function loadTools() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        // 数据损坏时回退到默认
    }
    return [...DEFAULT_TOOLS];
}

export function saveTools() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(App.tools));
}

export function readNoteLocal() {
    return localStorage.getItem(NOTE_KEY) || "";
}

export function writeNoteLocal(text) {
    localStorage.setItem(NOTE_KEY, text);
}

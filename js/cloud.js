// =========================================================
// cloud.js —— Supabase 初始化、登录态事件、数据同步与自愈
// 注意：SDK 全局变量叫 supabase（var 声明），这里用 supabaseClient
// =========================================================

import { App, DEFAULT_TOOLS, normUrlKey, extractErrMsg, saveTools, readNoteLocal, writeNoteLocal } from "./store.js?v=43";
import { renderCategories, renderGrid } from "./tools.js?v=43";
import { setNoteStatus, getNoteValue, setNoteValue } from "./notes.js?v=43";
import { updateAuthUI } from "./auth.js?v=43";
import { loadPlaces, clearPlacesUI, isMapReady } from "./map.js?v=43";

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

export async function initCloud() {
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

    App.supabaseClient = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    App.cloudReady = true;
    updateAuthUI();

    App.supabaseClient.auth.onAuthStateChange((event, session) => {
        if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
            handleSignedIn(session.user);
        } else if (event === "SIGNED_OUT") {
            handleSignedOut();
        }
    });
}

// ===== 登录后的云端同步 =====
function handleSignedIn(user) {
    if (App.syncing || (App.currentUser && App.currentUser.id === user.id)) return;
    App.syncing = true;
    App.currentUser = user;
    updateAuthUI();

    // 快照登录前的本地数据，退出登录时还原
    App.localBackup = { tools: App.tools.slice(), note: readNoteLocal() };

    syncOnLogin()
        .then(() => {
            App.syncFailCount = 0;
            if (isMapReady()) loadPlaces();
        })
        .catch((e) => {
            App.syncing = false;
            App.syncFailCount++;
            setTimeout(retrySyncLoop, 10000 * App.syncFailCount);
        });
}

function handleSignedOut() {
    App.currentUser = null;
    App.syncing = false;
    App.syncFailCount = 0;
    if (App.localBackup) {
        App.tools = App.localBackup.tools;
        setNoteValue(App.localBackup.note);
        saveTools();
        App.localBackup = null;
    }
    clearPlacesUI();
    updateAuthUI();
    renderCategories();
    renderGrid();
}

// 同步失败后的自愈循环：每轮间隔递增；连续 5 次失败则清理坏会话并要求重新登录
export function retrySyncLoop() {
    if (!App.currentUser || !App.supabaseClient || App.syncing) return;
    App.syncing = true;
    syncOnLogin()
        .then(() => {
            App.syncFailCount = 0;
            App.syncing = false;
        })
        .catch(() => {
            App.syncing = false;
            App.syncFailCount++;
            if (App.syncFailCount >= 5) {
                App.supabaseClient.auth.signOut();
                alert("云端同步连续失败，已自动退出登录（可能是 Supabase 平台故障，status.supabase.com 可查进度）。\n\n请稍后重新登录，即可拿到新的长效令牌恢复正常。");
                return;
            }
            setTimeout(retrySyncLoop, 15000 * App.syncFailCount);
        });
}

async function syncOnLogin() {
    // 确保登录凭据已附着到客户端，避免竞态导致插入被 RLS 误判为匿名写入
    await App.supabaseClient.auth.getSession();

    // 带重试的上传：Supabase 平台存在"刷新后 JWT 被拒"的已知故障，
    // 失败时先刷新会话令牌再等 2 秒重试，共 3 次
    async function uploadRows(rows) {
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            const { data, error } = await App.supabaseClient.from("tools").insert(rows).select();
            if (!error) return data;
            lastErr = error;
            try {
                await App.supabaseClient.auth.refreshSession();
            } catch (e) { /* 刷新失败不影响下一轮重试 */ }
            await new Promise((r) => setTimeout(r, 2000));
        }
        throw lastErr;
    }

    // 1. 拉取云端工具列表
    const { data: cloud, error } = await App.supabaseClient
        .from("tools")
        .select("*")
        .order("created_at", { ascending: true });
    if (error) throw error;

    const cloudKeys = new Set(cloud.map((t) => normUrlKey(t.url)));
    const localKeys = new Set(App.tools.map((t) => normUrlKey(t.url)));

    // 代码 DEFAULT_TOOLS 里新增的工具（本地和云端都没有的）自动合并进列表
    const newDefaults = DEFAULT_TOOLS.filter(
        (t) => !localKeys.has(normUrlKey(t.url)) && !cloudKeys.has(normUrlKey(t.url))
    );
    const base = App.tools.concat(newDefaults);

    if (cloud.length === 0 && base.length > 0) {
        // 2. 云端为空：把「本地列表 + 代码新增默认工具」整体上传
        const rows = base.map((t, i) => ({ user_id: App.currentUser.id, name: t.name, url: t.url, category: t.category, sort: i }));
        App.tools = await uploadRows(rows);
    } else if (cloud.length > 0) {
        // 3. 合并：本地/代码有、云端没有的上传；结果以云端为准
        const extra = base.filter((t) => !cloudKeys.has(normUrlKey(t.url)));
        if (extra.length > 0) {
            const rows = extra.map((t, i) => ({ user_id: App.currentUser.id, name: t.name, url: t.url, category: t.category, sort: cloud.length + i }));
            const inserted = await uploadRows(rows);
            cloud.push(...inserted);
        }
        App.tools = cloud;
    }

    saveTools();

    // 4. 笔记：云端有就用云端的，否则把本地笔记上传
    const { data: noteRow } = await App.supabaseClient
        .from("notes")
        .select("content")
        .eq("user_id", App.currentUser.id)
        .maybeSingle();

    if (noteRow && noteRow.content) {
        setNoteValue(noteRow.content);
    } else if (getNoteValue().trim()) {
        await App.supabaseClient
            .from("notes")
            .upsert({ user_id: App.currentUser.id, content: getNoteValue(), updated_at: new Date().toISOString() });
    }

    renderCategories();
    renderGrid();
}

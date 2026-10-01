// =========================================================
// auth.js —— 登录 / 注册 / 修改密码 / 退出 的界面与逻辑
// =========================================================

import { App, extractErrMsg } from "./store.js?v=1.0.0";
import { LOGIN_PET_TIPS, PET_PART_BOXES } from "./content.js?v=1.0.0";

const userArea = document.getElementById("userArea");
const loginBtn = document.getElementById("loginBtn");
const userChip = document.getElementById("userChip");
const userEmail = document.getElementById("userEmail");

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
const authSub = document.getElementById("authSub");
const pwEye = document.getElementById("pwEye");

let authMode = "login";

// ===== 登录页左侧：跟随鼠标的小柚 =====
const authStage = document.getElementById("authStage");
authStage.innerHTML = `
    <div class="auth-pet" title="点我">
        <div class="ap-bubble"></div>
        <div class="ap-body">
            <canvas class="ap-layer" data-layer="base"></canvas>
            <canvas class="ap-layer" data-layer="earL"></canvas>
            <canvas class="ap-layer" data-layer="earR"></canvas>
            <canvas class="ap-layer" data-layer="pawL"></canvas>
            <canvas class="ap-layer" data-layer="pawR"></canvas>
        </div>
    </div>`;
const aPet = authStage.querySelector(".auth-pet");
const aBubble = authStage.querySelector(".ap-bubble");
const aBody = authStage.querySelector(".ap-body");
let aBubbleTimer = null, aRaf = 0;

// 图层区域（以 658x658 原图为基准；origin = 各部位摆动的关节点）
// 注意：头发不单独分层——侧发处在人物剪影边缘，独立摆动会在紫底上露出底图破绽
async function buildPetLayers() {
    const img = new Image();
    img.src = "assets/pet.webp";
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const src = document.createElement("canvas");
    src.width = W;
    src.height = H;
    const sctx = src.getContext("2d");
    sctx.drawImage(img, 0, 0);

    // 去白底：从四条边向内泛洪填充，与边缘连通的近白像素变透明
    const data = sctx.getImageData(0, 0, W, H);
    const px = data.data;
    const idx = (x, y) => (y * W + x) * 4;
    const isBg = (x, y) => {
        const i = idx(x, y);
        return px[i + 3] === 0 || (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235);
    };
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
    for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
    while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x]) continue;
        if (!isBg(x, y)) continue;
        seen[y * W + x] = 1;
        px[idx(x, y) + 3] = 0;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
    // 边缘羽化：紧贴透明区的亮色像素降低透明度，避免白边
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = idx(x, y);
            if (px[i + 3] === 0) continue;
            const nearClear =
                (x > 0 && px[idx(x - 1, y) + 3] === 0) || (x < W - 1 && px[idx(x + 1, y) + 3] === 0) ||
                (y > 0 && px[idx(x, y - 1) + 3] === 0) || (y < H - 1 && px[idx(x, y + 1) + 3] === 0);
            if (!nearClear) continue;
            const bright = (px[i] + px[i + 1] + px[i + 2]) / 3;
            if (bright > 205) px[i + 3] = Math.round(px[i + 3] * Math.max(0, 1 - (bright - 205) / 50));
        }
    }
    sctx.putImageData(data, 0, 0);

    const base = document.querySelector('[data-layer="base"]');
    base.width = W;
    base.height = H;
    base.getContext("2d").drawImage(src, 0, 0);
    for (const [key, box] of Object.entries(PET_PART_BOXES)) {
        const el = document.querySelector(`[data-layer="${key}"]`);
        el.width = W;
        el.height = H;
        el.getContext("2d").drawImage(src, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
        el.style.transformOrigin = box.origin;
    }
}
buildPetLayers().catch((e) => console.warn("桌宠图层构建失败：", e));

function aSay(text) {
    aBubble.textContent = text;
    aBubble.classList.add("show");
    clearTimeout(aBubbleTimer);
    aBubbleTimer = setTimeout(() => aBubble.classList.remove("show"), 2800);
}
authMask.addEventListener("mousemove", (e) => {
    if (aRaf) return;
    aRaf = requestAnimationFrame(() => {
        aRaf = 0;
        const r = aPet.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        aBody.style.transform = `rotate(${Math.max(-8, Math.min(8, dx / 28)).toFixed(1)}deg)`;
    });
});
aPet.addEventListener("click", () => {
    aPet.classList.add("jump");
    setTimeout(() => aPet.classList.remove("jump"), 950);
    aSay(LOGIN_PET_TIPS[Math.floor(Math.random() * LOGIN_PET_TIPS.length)]);
});

export function updateAuthUI() {
    if (!App.cloudReady) {
        userArea.hidden = true;
        return;
    }
    userArea.hidden = false;
    const loggedIn = !!App.currentUser;
    loginBtn.hidden = loggedIn;
    userChip.hidden = !loggedIn;
    userEmail.textContent = loggedIn ? App.currentUser.email : "";
    userEmail.title = loggedIn ? App.currentUser.email : "";
}

function setPwVisible(visible) {
    authPassword.type = visible ? "text" : "password";
    pwEye.textContent = visible ? "🙈" : "👁";
}

function openAuth(mode) {
    authMode = mode;
    authTitle.textContent = mode === "login" ? "欢迎回来" : "创建新账号";
    authSub.textContent = mode === "login" ? "登录后笔记与工具全设备同步" : "注册后数据自动云同步，跟随账号走";
    authSubmit.textContent = mode === "login" ? "登录" : "注册";
    tabLogin.classList.toggle("active", mode === "login");
    tabRegister.classList.toggle("active", mode === "register");
    authError.textContent = "";
    authError.classList.remove("ok");
    authPassword.value = "";
    setPwVisible(false);
    authMask.hidden = false;
    authEmail.focus();
    aSay(mode === "login" ? "欢迎回来呀～" : "新朋友？注册一个吧！");
}

export function openLoginModal() {
    openAuth("login");
}

export function closeAuth() {
    authMask.hidden = true;
}

loginBtn.addEventListener("click", () => openAuth("login"));
document.getElementById("authCancel").addEventListener("click", closeAuth);
document.getElementById("authX").addEventListener("click", closeAuth);
authMask.addEventListener("click", (e) => {
    if (e.target === authMask) closeAuth();
});

// 密码可见切换
pwEye.addEventListener("click", () => {
    setPwVisible(authPassword.type === "password");
});

tabLogin.addEventListener("click", () => openAuth("login"));
tabRegister.addEventListener("click", () => openAuth("register"));

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!App.supabaseClient) {
        authError.textContent = "云端服务未连接，请检查网络后刷新页面再试";
        return;
    }
    const email = authEmail.value.trim();
    const password = authPassword.value;
    authError.classList.remove("ok");
    authError.textContent = "";
    authSubmit.disabled = true;
    authSubmit.textContent = authMode === "login" ? "登录中…" : "注册中…";

    try {
        if (authMode === "login") {
            const { error } = await App.supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            closeAuth(); // 登录成功，SIGNED_IN 事件会触发后续同步
        } else {
            const { data, error } = await App.supabaseClient.auth.signUp({ email, password });
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
        authSubmit.textContent = authMode === "login" ? "登录" : "注册";
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

export function closePwModal() {
    pwMask.hidden = true;
}
pwMask.addEventListener("click", (e) => {
    if (e.target === pwMask) pwMask.hidden = true;
});

pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!App.supabaseClient) {
        pwError.textContent = "云端服务未连接，请检查网络后刷新页面再试";
        return;
    }
    pwError.textContent = "";
    try {
        const { error } = await App.supabaseClient.auth.updateUser({ password: pwNew.value });
        if (error) throw error;
        pwMask.hidden = true;
        alert("密码修改成功");
    } catch (err) {
        pwError.textContent = extractErrMsg(err);
    }
});

// 退出登录
document.getElementById("logoutBtn").addEventListener("click", async () => {
    await App.supabaseClient.auth.signOut(); // SIGNED_OUT 事件负责还原本地数据
});

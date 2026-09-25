// =========================================================
// auth.js —— 登录 / 注册 / 修改密码 / 退出 的界面与逻辑
// =========================================================

import { App, extractErrMsg } from "./store.js";

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

let authMode = "login";

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

export function openLoginModal() {
    openAuth("login");
}

export function closeAuth() {
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

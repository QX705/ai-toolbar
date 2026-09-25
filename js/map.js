// =========================================================
// map.js —— 高德地图：选点/搜索 → 地点 → 攻略（读/写）→ 照片
// 读：所有人写的攻略和图片；写：每次新开一条，可查可删自己的
// =========================================================

import { App, escapeHtml, extractErrMsg } from "./store.js?v=43";
import { openLoginModal } from "./auth.js?v=43";

const mapSection = document.getElementById("mapSection");
const mapSearch = document.getElementById("mapSearch");
const mapStatus = document.getElementById("mapStatus");

const placeEditor = document.getElementById("placeEditor");
const placeEditorTitle = document.getElementById("placeEditorTitle");
const placeCloseBtn = document.getElementById("placeCloseBtn");
const placeCreateBox = document.getElementById("placeCreateBox");
const placeName = document.getElementById("placeName");
const placeCreateBtn = document.getElementById("placeCreateBtn");
const placeTabsBox = document.getElementById("placeTabsBox");
const tabRead = document.getElementById("tabRead");
const tabWrite = document.getElementById("tabWrite");
const readPane = document.getElementById("readPane");
const writePane = document.getElementById("writePane");
const readPhotos = document.getElementById("readPhotos");
const readPhotosEmpty = document.getElementById("readPhotosEmpty");
const readGuides = document.getElementById("readGuides");
const readGuidesEmpty = document.getElementById("readGuidesEmpty");
const guideText = document.getElementById("guideText");
const guidePhotoInput = document.getElementById("guidePhotoInput");
const guidePendingGrid = document.getElementById("guidePendingGrid");
const guideSaveBtn = document.getElementById("guideSaveBtn");
const myGuides = document.getElementById("myGuides");
const myGuidesEmpty = document.getElementById("myGuidesEmpty");
const placeFirstGuide = document.getElementById("placeFirstGuide");
const placeFirstPhotoInput = document.getElementById("placeFirstPhotoInput");
const placeFirstGrid = document.getElementById("placeFirstGrid");
const placeError = document.getElementById("placeError");
const placeChips = document.getElementById("placeChips");

let amapMap = null;
let mapLoading = false;
let mapReady = false;
let mapRetryUsed = false;

let places = [];            // 全部地点（含别人的）
let activePlace = null;     // 当前选中的地点 {id, name, lng, lat}
let guides = [];            // 当前地点的所有攻略（读视图数据）
let pendingFiles = [];      // 写视图：待上传图片
let placeFirstFiles = [];   // 创建地点时的待上传图片
let placeMarkers = [];

export const amapConfigured =
    typeof AMAP_KEY === "string" && AMAP_KEY.trim().length > 10 &&
    typeof AMAP_SECURITY_CODE === "string" && AMAP_SECURITY_CODE.trim().length > 10;

function setMapStatus(text) {
    mapStatus.textContent = text;
}

export function isMapReady() {
    return mapReady;
}

function loadAmapScript() {
    return new Promise((resolve, reject) => {
        if (window.AMap && window.AMap.Map) return resolve();
        window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE.trim() };
        const s = document.createElement("script");
        s.src = "https://webapi.amap.com/maps?v=1.4.15&key=" + encodeURIComponent(AMAP_KEY.trim()) +
            "&plugin=AMap.PlaceSearch,AMap.AutoComplete,AMap.Geolocation,AMap.Scale,AMap.Geocoder";
        s.onload = () => {
            let waited = 0;
            const timer = setInterval(() => {
                if (window.AMap && window.AMap.Map) {
                    clearInterval(timer);
                    resolve();
                } else if (++waited > 100) {
                    clearInterval(timer);
                    reject(new Error("脚本加载失败"));
                }
            }, 100);
        };
        s.onerror = () => reject(new Error("脚本加载失败"));
        document.head.appendChild(s);
    });
}

async function initMap() {
    if (mapReady || mapLoading) return;
    mapLoading = true;

    setMapStatus("正在加载地图…");
    try {
        await loadAmapScript();

        amapMap = new AMap.Map("mapContainer", {
            zoom: 11,
            center: [116.397, 39.909], // 默认北京，可用搜索/定位移动
        });

        // 点击地图：选中这个位置（创建或打开地点）
        amapMap.on("click", (e) => {
            selectLocation(e.lnglat.getLng(), e.lnglat.getLat(), "");
        });

        amapMap.on("complete", () => {
            mapReady = true;
            mapLoading = false;
            setMapStatus("");
            loadPlaces();
        });

        try {
            amapMap.addControl(new AMap.Scale());
            amapMap.addControl(new AMap.ToolBar({ position: "RB" }));
        } catch (e) { console.warn("地图工具条不可用", e); }

        try {
            const autoComplete = new AMap.AutoComplete({ input: "mapSearch" });
            autoComplete.on("select", (e) => {
                const poi = e.poi;
                if (!poi || !poi.location) {
                    setMapStatus("没找到该地点，换个关键词试试");
                    return;
                }
                amapMap.setZoomAndCenter(15, [poi.location.lng, poi.location.lat]);
                selectLocation(poi.location.lng, poi.location.lat, poi.name || "");
            });
        } catch (e) { console.warn("搜索联想不可用", e); }

        // 回车 = 直接搜索关键词并定位（不依赖联想下拉）
        mapSearch.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            const kw = mapSearch.value.trim();
            if (!kw) return;
            setMapStatus("正在搜索「" + kw + "」…");
            const search = new AMap.PlaceSearch({ city: "全国", pageSize: 5 });
            search.search(kw, (status, result) => {
                if (status === "complete" && result.poiList && result.poiList.pois.length > 0) {
                    const poi = result.poiList.pois[0];
                    const pos = [poi.location.lng, poi.location.lat];
                    amapMap.setZoomAndCenter(15, pos);
                    new AMap.Marker({ position: pos, title: poi.name, map: amapMap });
                    selectLocation(poi.location.lng, poi.location.lat, poi.name || kw);
                    setMapStatus("");
                } else {
                    setMapStatus("没找到「" + kw + "」，换个关键词试试");
                }
            });
        });

        // 兜底：25 秒仍未完成 → 销毁重建一次（瓦片加载停滞的自愈）
        setTimeout(() => {
            if (!mapReady && amapMap) {
                try { amapMap.destroy(); } catch (e) { /* 忽略 */ }
                amapMap = null;
                mapLoading = false;
                mapRetryUsed = false;
                initMap();
            }
        }, 25000);
    } catch (e) {
        mapLoading = false;
        if (!mapRetryUsed) {
            mapRetryUsed = true;
            setTimeout(initMap, 1500);
            return;
        }
        setMapStatus("地图加载失败：请检查 Key 是否正确、网络是否可达 webapi.amap.com");
    }
}

if (amapConfigured) {
    const mapObserver = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (en.isIntersecting) {
                mapObserver.disconnect();
                initMap();
            }
        });
    }, { threshold: 0.1 });
    mapObserver.observe(mapSection);

    // 控制条上的地图按钮：切换「地图视图」和「工具视图」
    const mapJumpBtn = document.getElementById("mapJump");
    if (mapJumpBtn) {
        mapJumpBtn.hidden = false;
        mapSection.hidden = true; // 默认显示工具视图
        mapJumpBtn.addEventListener("click", () => {
            const now = Date.now();
            // window 级防抖：即使模块被加载两个实例，也只触发一次切换
            if (window.__lastMapToggle && now - window.__lastMapToggle < 500) return;
            window.__lastMapToggle = now;
            const showMap = mapSection.hidden;
            mapSection.hidden = !showMap;
            document.getElementById("toolSections").hidden = showMap;
            if (showMap) {
                initMap(); // 第一次打开时才加载地图
                mapJumpBtn.title = "返回工具列表";
                // 攻略面板常驻右侧：没有选中地点时显示创建表单
                if (!activePlace) {
                    placeEditor.hidden = false;
                    placeCreateBox.hidden = false;
                    placeTabsBox.hidden = true;
                }
            } else {
                mapJumpBtn.title = "打开地图";
            }
        });
    }
} else {
    mapSection.hidden = true; // 未配置高德 Key：不显示地图板块
}

document.getElementById("mapLocate").addEventListener("click", () => {
    if (!mapReady) return;
    setMapStatus("正在获取定位…");
    const geo = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000 });
    geo.getCurrentPosition((status, result) => {
        if (status === "complete") {
            amapMap.setZoomAndCenter(15, [result.position.lng, result.position.lat]);
            new AMap.Marker({ position: [result.position.lng, result.position.lat], title: "我的位置", map: amapMap });
            setMapStatus("已定位到你的位置");
        } else {
            setMapStatus("定位失败：请检查浏览器定位权限");
        }
    });
});

// =========================================================
// 地点与攻略
// =========================================================

function maskEmail(email) {
    if (!email || !email.includes("@")) return "旅友";
    const [name, domain] = email.split("@");
    const head = name.slice(0, 3);
    return head + "***@" + domain;
}

function renderMarkers() {
    if (!amapMap) return;
    placeMarkers.forEach((m) => m.setMap(null));
    placeMarkers = [];
    places.forEach((p) => {
        const m = new AMap.Marker({
            position: [p.lng, p.lat],
            title: p.name,
            map: amapMap,
            label: { content: escapeHtml(p.name), direction: "top" },
        });
        m.on("click", () => {
            amapMap.setZoomAndCenter(15, [p.lng, p.lat]);
            openPlace(p);
        });
        placeMarkers.push(m);
    });
}

function renderPlaceChips() {
    placeChips.innerHTML = "";
    places.forEach((p) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "place-chip";
        chip.textContent = "📍 " + p.name;
        chip.addEventListener("click", () => {
            amapMap.setZoomAndCenter(14, [p.lng, p.lat]);
            openPlace(p);
        });
        placeChips.appendChild(chip);
    });
}

export async function loadPlaces() {
    if (!App.supabaseClient || !mapReady) return;
    const { data, error } = await App.supabaseClient
        .from("places")
        .select("*")
        .order("created_at", { ascending: true });
    if (error) {
        setMapStatus("⚠ " + extractErrMsg(error));
        return;
    }
    places = data || [];
    renderMarkers();
    renderPlaceChips();
}

export function clearPlacesUI() {
    places = [];
    guides = [];
    activePlace = null;
    pendingFiles = [];
    if (amapMap && mapReady) {
        placeMarkers.forEach((m) => m.setMap(null));
        placeMarkers = [];
        renderPlaceChips();
        closePlaceEditor();
    }
}

// 选中一个位置：已有地点直接打开；新位置进入创建草稿
function selectLocation(lng, lat, presetName) {
    if (!App.currentUser) {
        setMapStatus("请先登录，登录后即可在地图上记录攻略");
        openLoginModal();
        return;
    }
    const existing = places.find((p) => p.name === presetName && presetName !== "");
    if (existing) {
        openPlace(existing);
        return;
    }
    // 新地点草稿
    activePlace = { id: null, name: presetName, lng, lat };
    guides = [];
    placeEditorTitle.textContent = "📍 新地点";
    placeCreateBox.hidden = false;
    placeTabsBox.hidden = true;
    placeName.value = presetName;
    placeError.textContent = "";

    // 逆地理编码补一个默认名称
    if (!presetName && window.AMap && AMap.Geocoder) {
        const geo = new AMap.Geocoder();
        geo.getAddress([lng, lat], (status, result) => {
            if (status === "complete" && result.regeocode && activePlace && !placeName.value) {
                placeName.value = (result.regeocode.formattedAddress || "").replace(/^中国/, "").slice(0, 30);
            }
        });
    }
    placeName.focus();
}

// 创建地点时的图片选择（原图直传）
placeFirstPhotoInput.addEventListener("change", () => {
    const picked = [...placeFirstPhotoInput.files];
    placeFirstPhotoInput.value = "";
    if (picked.length === 0) return;
    const accepted = [];
    const rejected = [];
    for (const f of picked) {
        if (!f.type.startsWith("image/")) { rejected.push(f.name + "（不是图片）"); continue; }
        if (f.size > 50 * 1024 * 1024) { rejected.push(f.name + "（超过 50MB）"); continue; }
        accepted.push(f);
    }
    placeFirstFiles = placeFirstFiles.concat(accepted);
    renderFirstGrid();
    if (rejected.length > 0) {
        placeError.textContent = "已跳过：" + rejected.join("、");
        placeError.classList.remove("ok");
    } else {
        placeError.textContent = "已选择 " + accepted.length + " 张原图";
        placeError.classList.add("ok");
    }
});

function renderFirstGrid() {
    placeFirstGrid.innerHTML = "";
    placeFirstFiles.forEach((f, i) => {
        const wrap = document.createElement("div");
        wrap.className = "photo-item";
        wrap.innerHTML = `<img src="${URL.createObjectURL(f)}" alt=""><button class="photo-del" title="移除">✕</button>`;
        wrap.querySelector(".photo-del").addEventListener("click", () => {
            placeFirstFiles.splice(i, 1);
            renderFirstGrid();
        });
        placeFirstGrid.appendChild(wrap);
    });
}

placeCreateBtn.addEventListener("click", async () => {
    if (!activePlace) return;
    if (!App.currentUser) {
        placeError.textContent = "请先登录";
        return;
    }
    const name = placeName.value.trim();
    if (!name) {
        placeError.textContent = "请填写地点名称";
        return;
    }
    const content = placeFirstGuide.value.trim();
    if (!content && placeFirstFiles.length === 0) {
        placeError.textContent = "写点攻略或添加图片（也可以留空只建地点）";
        return;
    }
    placeCreateBtn.disabled = true;
    placeError.textContent = "";
    try {
        // 1. 创建地点
        const { data: place, error } = await App.supabaseClient
            .from("places")
            .insert({ user_id: App.currentUser.id, name, lng: activePlace.lng, lat: activePlace.lat })
            .select()
            .single();
        if (error) throw error;
        activePlace = { id: place.id, name: place.name, lng: place.lng, lat: place.lat };
        places.push(activePlace);

        // 2. 有攻略内容或图片 → 保存第一条攻略
        if (content || placeFirstFiles.length > 0) {
            const photos = [];
            for (const f of placeFirstFiles) {
                const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
                const path = `${App.currentUser.id}/${activePlace.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                const { error: upErr } = await App.supabaseClient.storage.from("place-photos").upload(path, f);
                if (upErr) throw upErr;
                const { data: pub } = App.supabaseClient.storage.from("place-photos").getPublicUrl(path);
                photos.push(pub.publicUrl);
            }
            const { data: guide, error: gErr } = await App.supabaseClient
                .from("place_guides")
                .insert({ user_id: App.currentUser.id, place_id: activePlace.id, author_email: App.currentUser.email || "", content, photos })
                .select()
                .single();
            if (gErr) throw gErr;
            guides.unshift(guide);
            placeFirstFiles = [];
            placeFirstGuide.value = "";
            renderFirstGrid();
        }

        renderMarkers();
        renderPlaceChips();
        placeCreateBox.hidden = true;
        placeTabsBox.hidden = false;
        enterPlaceView();
        placeError.classList.add("ok");
        placeError.textContent = "地点已创建 ✓";
    } catch (e) {
        placeError.textContent = "创建失败：" + extractErrMsg(e);
    } finally {
        placeCreateBtn.disabled = false;
    }
});

// 进入已创建地点的 读/写 视图
function enterPlaceView() {
    placeEditorTitle.textContent = "📍 " + activePlace.name;
    placeCreateBox.hidden = true;
    placeTabsBox.hidden = false;
    switchTab("read");
    loadGuides();
}

function openPlace(p) {
    activePlace = { id: p.id, name: p.name, lng: p.lng, lat: p.lat };
    placeEditorTitle.textContent = "📍 " + p.name;
    placeCreateBox.hidden = true;
    placeTabsBox.hidden = false;
    switchTab("read");
    loadGuides();
}

function switchTab(which) {
    const read = which === "read";
    tabRead.classList.toggle("active", read);
    tabWrite.classList.toggle("active", !read);
    readPane.hidden = !read;
    writePane.hidden = read;
}

tabRead.addEventListener("click", () => switchTab("read"));
tabWrite.addEventListener("click", () => switchTab("write"));

async function loadGuides() {
    if (!activePlace || !App.supabaseClient) return;
    readGuides.innerHTML = "";
    readPhotos.innerHTML = "";
    const { data, error } = await App.supabaseClient
        .from("place_guides")
        .select("*")
        .eq("place_id", activePlace.id)
        .order("created_at", { ascending: false });
    if (error) {
        readGuidesEmpty.hidden = false;
        readGuidesEmpty.textContent = "攻略加载失败：" + extractErrMsg(error);
        return;
    }
    guides = data || [];
    renderReadTab();
    renderMyGuides();
}

function renderReadTab() {
    // 图片墙：所有攻略的图片
    readPhotos.innerHTML = "";
    const allPhotos = guides.flatMap((g) => g.photos || []);
    readPhotosEmpty.hidden = allPhotos.length > 0;
    allPhotos.forEach((url) => {
        const item = document.createElement("div");
        item.className = "photo-item";
        item.innerHTML = `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
        item.addEventListener("click", () => window.open(url, "_blank"));
        readPhotos.appendChild(item);
    });

    // 攻略列表
    readGuides.innerHTML = "";
    readGuidesEmpty.hidden = guides.length > 0;
    guides.forEach((g) => {
        const card = document.createElement("div");
        card.className = "guide-card";
        const date = new Date(g.created_at).toLocaleDateString("zh-CN");
        const mine = App.currentUser && g.user_id === App.currentUser.id;
        card.innerHTML = `
            <div class="guide-head">
                <span class="guide-author">${escapeHtml(maskEmail(g.author_email))}${mine ? "（我）" : ""}</span>
                <span class="guide-date">${date}</span>
            </div>
            <div class="guide-content">${escapeHtml(g.content)}</div>
            ${(g.photos || []).length ? `<div class="guide-photos">${(g.photos || []).map((u) => `<img src="${escapeHtml(u)}" loading="lazy" alt="">`).join("")}</div>` : ""}
        `;
        readGuides.appendChild(card);
    });
}

function renderMyGuides() {
    myGuides.innerHTML = "";
    const mine = guides.filter((g) => App.currentUser && g.user_id === App.currentUser.id);
    myGuidesEmpty.hidden = mine.length > 0;
    mine.forEach((g) => {
        const item = document.createElement("div");
        item.className = "guide-card my";
        const date = new Date(g.created_at).toLocaleDateString("zh-CN");
        item.innerHTML = `
            <div class="guide-head">
                <span class="guide-date">${date}</span>
                <button type="button" class="guide-del" title="删除这条">🗑️</button>
            </div>
            <div class="guide-content">${escapeHtml(g.content) || "<i>（无文字）</i>"}</div>
            ${(g.photos || []).length ? `<div class="guide-photos">${(g.photos || []).map((u) => `<img src="${escapeHtml(u)}" loading="lazy" alt="">`).join("")}</div>` : ""}
        `;
        item.querySelector(".guide-del").addEventListener("click", () => deleteGuide(g));
        myGuides.appendChild(item);
    });
}

async function deleteGuide(g) {
    if (!confirm("确定删除这条攻略吗？图片也会一并删除。")) return;
    try {
        for (const url of g.photos || []) {
            const path = decodeURIComponent(url.split("/place-photos/")[1] || "");
            if (path) await App.supabaseClient.storage.from("place-photos").remove([path]);
        }
        const { error } = await App.supabaseClient.from("place_guides").delete().eq("id", g.id);
        if (error) throw error;
        await loadGuides();
    } catch (e) {
        placeError.textContent = "删除失败：" + extractErrMsg(e);
    }
}

// 写视图：待上传图片
guidePhotoInput.addEventListener("change", () => {
    const picked = [...guidePhotoInput.files];
    guidePhotoInput.value = "";
    if (picked.length === 0) return;
    pendingFiles = pendingFiles.concat(picked);
    renderPendingGrid();
});

function renderPendingGrid() {
    guidePendingGrid.innerHTML = "";
    pendingFiles.forEach((f, i) => {
        const wrap = document.createElement("div");
        wrap.className = "photo-item";
        wrap.innerHTML = `<img src="${URL.createObjectURL(f)}" alt=""><button class="photo-del" title="移除">✕</button>`;
        wrap.querySelector(".photo-del").addEventListener("click", () => {
            pendingFiles.splice(i, 1);
            renderPendingGrid();
        });
        guidePendingGrid.appendChild(wrap);
    });
}

// 保存一条新攻略（每次新开一条）
guideSaveBtn.addEventListener("click", async () => {
    if (!activePlace || !activePlace.id) return;
    if (!App.currentUser) {
        placeError.textContent = "请先登录再写攻略";
        return;
    }
    const content = guideText.value.trim();
    if (!content && pendingFiles.length === 0) {
        placeError.textContent = "写点文字或添加图片再保存";
        return;
    }
    guideSaveBtn.disabled = true;
    placeError.textContent = "";
    try {
        const photos = [];
        for (const f of pendingFiles) {
            const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${App.currentUser.id}/${activePlace.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error: upErr } = await App.supabaseClient.storage.from("place-photos").upload(path, f);
            if (upErr) throw upErr;
            const { data: pub } = App.supabaseClient.storage.from("place-photos").getPublicUrl(path);
            photos.push(pub.publicUrl);
        }
        const { data, error } = await App.supabaseClient
            .from("place_guides")
            .insert({ user_id: App.currentUser.id, place_id: activePlace.id, author_email: App.currentUser.email || "", content, photos })
            .select()
            .single();
        if (error) throw error;
        guides.unshift(data);
        pendingFiles = [];
        guideText.value = "";
        renderReadTab();
        renderMyGuides();
        guidePendingGrid.innerHTML = "";
        placeError.classList.add("ok");
        placeError.textContent = "攻略已发布 ✓";
    } catch (e) {
        placeError.textContent = "保存失败：" + extractErrMsg(e);
    } finally {
        guideSaveBtn.disabled = false;
    }
});

function closePlaceEditor() {
    placeEditor.hidden = true;
    activePlace = null;
    guides = [];
    pendingFiles = [];
}

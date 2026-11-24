/**
 * 溫莎城堡寵物沙龍｜共用 API、LIFF 驗證、錯誤處理與預覽假資料（?mock=1）
 */
(function () {
  const cfg = window.PWC_CONFIG || {};

  function escapeHtml(str) {
    return String(str === null || str === undefined ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (e) {
      return "";
    }
  }

  function isMockMode() {
    return getParam("mock") === "1";
  }

  function showToast(msg, durationMs) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = String(msg || "");
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.remove();
    }, durationMs || 2600);
  }

  function buildOaMessageUrl(oaId, message) {
    const cleanId = encodeURIComponent(String(oaId || cfg.LINE_OA_ID || "@976fowuq").trim());
    const cleanMsg = encodeURIComponent(String(message || ""));
    return "https://line.me/R/oaMessage/" + cleanId + "/?" + cleanMsg;
  }

  function parseJwtPayload(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) return null;
      let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      const jsonText =
        typeof TextDecoder !== "undefined"
          ? new TextDecoder("utf-8").decode(bytes)
          : decodeURIComponent(escape(bin));
      return JSON.parse(jsonText);
    } catch (e) {
      return null;
    }
  }

  function todayIsoTaipei(offsetDays) {
    const ms = Date.now() + 8 * 3600000 + (offsetDays || 0) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function formatMmDdWeekday(isoDate) {
    const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { label: isoDate || "", weekdayLabel: "" };
    const ms = Date.parse(isoDate + "T00:00:00+08:00") + 8 * 3600000;
    const wd = new Date(ms).getUTCDay();
    const names = ["日", "一", "二", "三", "四", "五", "六"];
    return {
      label: m[2] + "/" + m[3],
      weekdayLabel: names[wd] || ""
    };
  }

  function errorText(code, fallbackMsg) {
    const map = {
      auth: "登入已逾時，請關閉頁面再從選單打開",
      not_admin: "此頁面僅限店家人員使用",
      not_bound: "還沒有您的資料，請先填一次顧客單",
      slot_taken: "這個時段剛剛被預約走了，請選擇其他時段",
      forbidden: "找不到這筆資料，或您沒有權限查看喔",
      not_ready: "單據還在準備中，請稍後再看或聯絡店家",
      stale: "資料已更新，請重新載入",
      unknown_action: "系統設定異常，請聯絡店家",
      network: "網路連線不穩定，請檢查網路後再試一次"
    };
    if (code === "validation" && fallbackMsg) return fallbackMsg;
    return fallbackMsg || map[code] || "系統忙碌中，請稍後再試";
  }

  // 預覽模式（?mock=1）記憶體狀態
  function createMockState() {
    const today = todayIsoTaipei(0);
    const tomorrow = todayIsoTaipei(1);
    return {
      profile: {
        isNew: false,
        owner: {
          phone: "0912345678",
          name: "陳小美",
          realName: "陳美玲",
          address: "新北市中和區連城路100號",
          lineId: "mei0912",
          emergencyContact: "陳爸爸 / 0911222333 / 父親",
          photoConsent: "同意",
          referralSource: "Google 搜尋 / 地圖",
          socialTag: "@milktea_poodle",
          note: "奶茶較膽小，吹毛請開小風",
          alert: "對香味較敏感，請用無香精洗毛精",
          preference: "固定預約平日下午",
          staffNote: ""
        },
        pets: [
          {
            petId: "P-0001",
            name: "奶茶",
            species: "犬",
            breed: "貴賓",
            size: "小型",
            weight: 4.2,
            age: "3歲",
            gender: "女生",
            neutered: "是",
            microchip: "900123456789012",
            personality: "親人, 容易緊張",
            groomingExperience: "每月固定洗澡大美容",
            healthNote: "輕微皮膚敏感",
            visualCheck: "耳朵健康、毛髮略打結",
            emergencyMethod: "就近醫院",
            designatedHospital: "",
            groomingNote: "怕大聲吹風機，請開小風＋低溫",
            status: "使用中"
          }
        ],
        records: [
          {
            recordId: "G-0001",
            date: today,
            time: "14:00",
            service: "全套美容（洗澡＋剪毛）",
            groomingStyle: "泰迪頭、全身留 1cm",
            blade: "身體 #4F",
            behavior: "乖巧配合",
            amount: 1500,
            photoLinks: "",
            hasPhoto: false,
            customerNote: "耳朵邊稍微打結",
            staffNote: "皮膚狀況比上次穩定",
            customerSheetId: "C-20261123-001",
            receiptNo: "R-20261123-001",
            paymentStatus: "已收款",
            paymentMethod: "轉帳",
            paymentDate: today,
            signedBack: true,
            version: "v1"
          }
        ],
        pending: [
          {
            pendingId: "Q-0001",
            sourceRow: null,
            recordId: "G-0002",
            reason: "首次綁定待確認",
            formPhone: "0922111222",
            formOwnerName: "林大偉",
            formPetName: "麻糬",
            formBreed: "英短",
            sourceLineId: "U_NEW_LINE_009",
            status: "待處理"
          }
        ],
        today: today,
        tomorrow: tomorrow
      }
    };
  }

  let mockState = null;
  function getMockState() {
    if (!mockState) mockState = createMockState();
    return mockState;
  }

  function handleMockGetSlots() {
    const days = [];
    const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
    for (let d = 0; d < 14; d++) {
      const iso = todayIsoTaipei(d);
      const ms = Date.parse(iso + "T00:00:00+08:00") + 8 * 3600000;
      const wd = new Date(ms).getUTCDay();
      const info = formatMmDdWeekday(iso);
      if (wd === 1) {
        days.push({ date: iso, label: info.label, weekday: wd, weekdayLabel: weekdayNames[wd], closed: true, closedReason: "公休", hasAvailable: false, slots: [] });
        continue;
      }
      const rawTimes = ["10:00", "11:00", "13:30", "14:30", "15:30", "16:30", "17:30"];
      const slots = rawTimes.map(function (t, idx) {
        if (d === 0 && idx < 4) return { time: t, status: "unavailable" };
        if (d === 1 && (t === "14:30" || t === "15:30")) return { time: t, status: "full" };
        return { time: t, status: "available" };
      });
      days.push({
        date: iso,
        label: info.label,
        weekday: wd,
        weekdayLabel: weekdayNames[wd],
        closed: false,
        closedReason: "",
        hasAvailable: slots.some(function (s) { return s.status === "available"; }),
        slots: slots
      });
    }
    return Promise.resolve({
      ok: true,
      shopName: cfg.SHOP_NAME || "溫莎城堡寵物沙龍",
      lineOaId: cfg.LINE_OA_ID || "@976fowuq",
      notice: "大型犬美容約需 3 小時，建議挑選連續空格；點選「可約」時段就能直接線上預約喔！",
      updatedAt: "23:55",
      calendarConfigured: true,
      stepMin: 60,
      capacity: 2,
      days: days
    });
  }

  function handleMockPost(action, params) {
    const st = getMockState();
    if (action === "load_profile") {
      return Promise.resolve({ ok: true, isNew: false, owner: st.profile.owner, pets: st.profile.pets });
    }
    if (action === "submit_form") {
      const n = st.profile.records.length + 1;
      const recId = "G-" + String(n).padStart(4, "0");
      return Promise.resolve({
        ok: true,
        petId: (params.pet && params.pet.petId) || "P-0001",
        recordId: recId,
        customerSheetId: "C-20261123-00" + n,
        pdfGenerated: true,
        pendingBind: false
      });
    }
    if (action === "my_records") {
      if (!params.pet_id) {
        return Promise.resolve({
          ok: true,
          customer: { name: st.profile.owner.name },
          pets: st.profile.pets.map(function (p) {
            return {
              petId: p.petId,
              name: p.name,
              species: p.species,
              breed: p.breed,
              lastVisitDate: st.profile.today,
              visitCount: st.profile.records.length
            };
          }),
          bookings: (st.mockBookings && st.mockBookings.length) ? st.mockBookings : [{
            recordId: "G-0098", date: todayIsoTaipei(3), time: "10:00", petId: "P-0001", petName: "奶茶",
            service: "基礎洗澡", status: "待付訂金", deposit: 300, deadline: todayIsoTaipei(1) + " 20:00",
            overdue: false, last5: "", transferDate: "", canReport: true
          }],
          payment: { deposit: 300, bankAccount: "822 中國信託 123-456-789012（戶名：測試）", deadlineHours: 24 }
        });
      }
      return Promise.resolve({
        ok: true,
        pet: {
          petId: "P-0001",
          name: "奶茶",
          species: "犬",
          breed: "貴賓",
          lastVisitDate: st.profile.today,
          visitCount: st.profile.records.length
        },
        records: st.profile.records
      });
    }
    if (action === "get_document") {
      // 產生最小合法 1 頁 PDF 作為 ?mock=1 預覽
      const samplePdf =
        "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n" +
        "3 0 obj<</Type/Page/MediaBox[0 0 420 260]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n" +
        "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
        "5 0 obj<</Length 64>>stream\nBT /F1 16 Tf 30 160 Td (Windsor Castle Demo PDF: " +
        String(params.id || "DOC").replace(/[^A-Za-z0-9\-]/g, "") +
        ") Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF";
      return Promise.resolve({
        ok: true,
        filename: String(params.id || "demo") + ".pdf",
        mime: "application/pdf",
        base64: btoa(samplePdf)
      });
    }
    if (action === "staff_today") {
      return Promise.resolve({
        ok: true,
        date: params.date || st.profile.today,
        calendarConfigured: true,
        events: [
          {
            eventId: "EV_1",
            title: "奶茶 大美容",
            isAllDay: false,
            startTime: "14:00",
            endTime: "16:00",
            matchType: "phone",
            customer: {
              phone: "0912345678",
              name: "陳小美",
              alert: st.profile.owner.alert,
              hasPendingBind: false,
              pets: [{ petId: "P-0001", name: "奶茶", species: "犬", breed: "貴賓", groomingNote: st.profile.pets[0].groomingNote }]
            },
            candidates: []
          },
          {
            eventId: "EV_2",
            title: "新客人預約詢問",
            isAllDay: false,
            startTime: "16:30",
            endTime: "18:00",
            matchType: "unmatched",
            customer: null,
            candidates: []
          }
        ]
      });
    }
    if (action === "staff_search") {
      return Promise.resolve({
        ok: true,
        customers: [
          {
            phone: "0912345678",
            name: "陳小美",
            hasAlert: Boolean(st.profile.owner.alert),
            lastUpdated: st.profile.today + " 14:00",
            pets: st.profile.pets.map(function (p) {
              return { petId: p.petId, name: p.name, species: p.species, breed: p.breed, status: p.status };
            })
          }
        ],
        total: 1
      });
    }
    if (action === "staff_customer") {
      return Promise.resolve({
        ok: true,
        customer: {
          phone: st.profile.owner.phone,
          name: st.profile.owner.name,
          alert: st.profile.owner.alert,
          preference: st.profile.owner.preference,
          lineUserId: "U_CUST_A",
          note: st.profile.owner.note,
          staffNote: st.profile.owner.staffNote
        },
        pets: st.profile.pets.map(function (p) {
          return Object.assign({}, p, { visitCount: st.profile.records.length, lastVisitDate: st.profile.today });
        }),
        pendingItems: []
      });
    }
    if (action === "staff_pet") {
      return Promise.resolve({
        ok: true,
        customer: {
          phone: st.profile.owner.phone,
          name: st.profile.owner.name,
          alert: st.profile.owner.alert,
          preference: st.profile.owner.preference
        },
        pet: st.profile.pets[0],
        stats: {
          visitCount: st.profile.records.length,
          lastVisitDate: st.profile.today,
          avgIntervalDays: 28,
          totalSpent: 1500,
          nextSuggestedDate: todayIsoTaipei(28)
        },
        records: st.profile.records
      });
    }
    if (action === "staff_add_customer_note") {
      const fMap = { "注意事項": "alert", "偏好": "preference", "管理者備註": "staffNote" };
      const k = fMap[params.field] || "alert";
      const entry = "[" + st.profile.today + " 沙沙] " + params.note;
      st.profile.owner[k] = st.profile.owner[k] ? entry + "\n" + st.profile.owner[k] : entry;
      return Promise.resolve({ ok: true, phone: params.phone, field: params.field, value: st.profile.owner[k] });
    }
    if (action === "staff_add_pet_note") {
      const entry = "[" + st.profile.today + " 沙沙] " + params.note;
      st.profile.pets[0].groomingNote = st.profile.pets[0].groomingNote ? entry + "\n" + st.profile.pets[0].groomingNote : entry;
      return Promise.resolve({ ok: true, petId: params.petId, groomingNote: st.profile.pets[0].groomingNote });
    }
    if (action === "staff_save_record") {
      return Promise.resolve({ ok: true, recordId: params.recordId || "G-0002", version: "v2" });
    }
    if (action === "staff_pending_list") {
      return Promise.resolve({ ok: true, items: st.profile.pending.filter(function (x) { return params.status === "ALL" || x.status === "待處理"; }) });
    }
    if (action === "staff_pending_resolve") {
      st.profile.pending = [];
      return Promise.resolve({ ok: true, pendingId: params.pendingId, status: "已處理" });
    }
    // 線上預約（預覽模式）
    if (action === "book_slot") {
      st.mockBookings = st.mockBookings || [];
      const bk = {
        recordId: params.recordId || "G-00" + (90 + st.mockBookings.length),
        date: params.date || todayIsoTaipei(2),
        time: params.time || "14:30",
        petId: params.petId || "P-0001",
        petName: (st.profile.pets.find(function (p) { return p.petId === params.petId; }) || st.profile.pets[0] || {}).name || "毛孩",
        service: params.service || "基礎洗澡",
        status: "待付訂金",
        deposit: 300,
        deadline: todayIsoTaipei(1) + " 20:00",
        overdue: false,
        last5: "",
        transferDate: "",
        canReport: true
      };
      st.mockBookings.push(bk);
      return Promise.resolve({ ok: true, booking: bk, payment: { deposit: 300, bankAccount: "822 中國信託 123-456-789012（戶名：測試）", deadlineHours: 24 }, alreadyBooked: false });
    }
    if (action === "report_payment") {
      (st.mockBookings || []).forEach(function (b) {
        if (b.recordId === params.recordId) { b.status = "待確認收款"; b.last5 = params.last5; b.transferDate = params.transferDate; }
      });
      return Promise.resolve({ ok: true, recordId: params.recordId, status: "待確認收款" });
    }
    if (action === "staff_booking_list") {
      const list = (st.mockBookings || []).filter(function (b) { return b.status !== "已確認" && b.status !== "已取消"; });
      return Promise.resolve({
        ok: true,
        needShopConfirm: false,
        counts: {},
        bookings: list.length ? list.map(function (b) { return Object.assign({ ownerName: "陳小美", phone: "0912345678", customerNote: "" }, b); }) : [{
          recordId: "G-0099", date: todayIsoTaipei(2), time: "14:30", petName: "奶茶", service: "基礎洗澡",
          status: "待確認收款", deposit: 300, deadline: todayIsoTaipei(1) + " 20:00", overdue: false,
          last5: "12345", transferDate: todayIsoTaipei(0), canReport: true, ownerName: "陳小美", phone: "0912345678", customerNote: "怕吹風機"
        }]
      });
    }
    if (action === "staff_confirm_payment" || action === "staff_confirm_booking") {
      return Promise.resolve({ ok: true, recordId: params.recordId, status: "已確認" });
    }
    if (action === "staff_cancel_booking") {
      return Promise.resolve({ ok: true, recordId: params.recordId, status: "已取消" });
    }
    if (action === "staff_extend_booking") {
      return Promise.resolve({ ok: true, recordId: params.recordId, status: "待付訂金", deadline: todayIsoTaipei(2) + " 20:00" });
    }
    if (action === "staff_link_event") {
      return Promise.resolve({ ok: true, eventId: params.eventId, phone: params.phone, customerName: "陳小美" });
    }
    return Promise.resolve({ ok: false, error: "unknown_action", message: "不支援的動作" });
  }

  // 同一頁只呼叫一次 liff.init（查空檔頁會先初始化看參數，按預約才要求登入）
  const liffInitPromises = {};
  function liffInitOnce(liffId) {
    if (!window.liff) {
      return Promise.reject(new Error("no liff sdk"));
    }
    if (!liffInitPromises[liffId]) {
      liffInitPromises[liffId] = window.liff.init({ liffId: liffId });
    }
    return liffInitPromises[liffId];
  }

  async function initLiffAuth(liffId) {
    if (isMockMode()) {
      return {
        ok: true,
        isMock: true,
        idToken: "MOCK_ID_TOKEN",
        sub: getParam("role") === "staff" ? "U_STAFF_001" : "U_CUST_A",
        displayName: "測試模式"
      };
    }

    if (!window.liff) {
      return { ok: false, error: "auth", message: "找不到 LINE LIFF 套件，請在 LINE 內開啟此連結" };
    }

    const tryKey = "pwc_login_try_" + liffId;
    try {
      await liffInitOnce(liffId);
    } catch (err) {
      return {
        ok: false,
        error: "auth",
        message: "無法初始化 LINE 登入，請關閉頁面再從選單打開"
      };
    }

    if (!window.liff.isLoggedIn()) {
      if (!sessionStorage.getItem(tryKey)) {
        sessionStorage.setItem(tryKey, "1");
        window.liff.login({ redirectUri: window.location.href });
        return { ok: false, redirecting: true, error: "auth", message: "正在前往 LINE 登入…" };
      }
      return { ok: false, error: "auth", message: "請使用 LINE 開啟此頁面完成登入" };
    }

    let idToken = window.liff.getIDToken();
    const jwt = parseJwtPayload(idToken);
    const isExpired = !idToken || !jwt || (jwt.exp && jwt.exp * 1000 <= Date.now() + 15000);

    if (isExpired) {
      const reauthKey = "pwc_reauth_try_" + liffId;
      if (!sessionStorage.getItem(reauthKey)) {
        sessionStorage.setItem(reauthKey, "1");
        try {
          window.liff.logout();
          window.liff.login({ redirectUri: window.location.href });
          return { ok: false, redirecting: true, error: "auth", message: "正在重新整理登入狀態…" };
        } catch (ignore) {
          // 繼續回傳逾時訊息
        }
      }
      return { ok: false, error: "auth", message: "登入已逾時，請關閉頁面再從選單打開" };
    }

    sessionStorage.removeItem(tryKey);
    sessionStorage.removeItem("pwc_reauth_try_" + liffId);

    return {
      ok: true,
      isMock: false,
      idToken: idToken,
      sub: (jwt && jwt.sub) || "",
      displayName: (jwt && jwt.name) || ""
    };
  }

  async function apiGetSlots() {
    if (isMockMode()) {
      return handleMockGetSlots();
    }
    const apiUrl = String(cfg.API_URL || "").trim();
    if (!apiUrl) {
      return {
        ok: false,
        error: "not_ready",
        message: "時段查詢後端尚未完成設定，完成試算表部署並填入網址後即可即時讀取日曆。（可於網址加上 ?mock=1 預覽畫面）"
      };
    }
    try {
      const url = apiUrl + (apiUrl.indexOf("?") !== -1 ? "&" : "?") + "action=slots";
      const resp = await fetch(url, { method: "GET", redirect: "follow" });
      if (!resp.ok) {
        return { ok: false, error: "network", message: "讀取失敗（" + resp.status + "），請稍後再試" };
      }
      return await resp.json();
    } catch (e) {
      return { ok: false, error: "network", message: "無法連線到伺服器，請稍後再試" };
    }
  }

  async function apiPost(action, params, authCtx) {
    if (isMockMode()) {
      return handleMockPost(action, params || {});
    }
    const apiUrl = String(cfg.API_URL || "").trim();
    if (!apiUrl) {
      return {
        ok: false,
        error: "not_ready",
        message: "系統後端網址尚未設定，完成 Google Apps Script 部署並填入網址後即可正式執行。"
      };
    }
    try {
      const body = Object.assign({}, params || {}, {
        action: action,
        idToken: authCtx && authCtx.idToken ? authCtx.idToken : ""
      });
      // 使用 text/plain 避開 Google Apps Script CORS preflight
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        return { ok: false, error: "network", message: "伺服器回應失敗，請稍後再試" };
      }
      return await resp.json();
    } catch (e) {
      return { ok: false, error: "network", message: "網路連線中斷，請檢查網路後重試" };
    }
  }

  window.PwcApi = {
    escapeHtml: escapeHtml,
    getParam: getParam,
    isMockMode: isMockMode,
    showToast: showToast,
    buildOaMessageUrl: buildOaMessageUrl,
    todayIsoTaipei: todayIsoTaipei,
    formatMmDdWeekday: formatMmDdWeekday,
    errorText: errorText,
    initLiffAuth: initLiffAuth,
    liffInitOnce: liffInitOnce,
    apiGetSlots: apiGetSlots,
    apiPost: apiPost
  };
})();

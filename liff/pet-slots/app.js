/**
 * 03｜查空檔＋線上預約（LIFF 2012766085-TC2EpM5n）
 * - 看空檔不用登入（讀 Apps Script doGet?action=slots）
 * - 點「可約」→「預約這個時段」才要求 LINE 登入：
 *   老客人：選毛孩、服務、備註 → book_slot（保留時段＋建立日曆事件）→ 顯示訂金匯款資訊與回報表單
 *   新客人：導到填顧客單（帶 date、time、from=slots），填完回到這頁（帶 record）確認預約
 * 網址參數（皆在 liff.init 之後讀取）：
 *   ?book=YYYY-MM-DD_HH:mm   進入預約表單（登入回來時接續）
 *   ?record=G-0001&date=…&time=…   新客人填完顧客單接回確認
 */
(function () {
  const cfg = window.PWC_CONFIG || {};
  const api = window.PwcApi;
  const LIFF_ID = (cfg.LIFF_IDS && cfg.LIFF_IDS.SLOTS) || "";

  const SERVICE_OPTIONS = [
    "基礎洗澡", "日常洗護", "全身造型大美容", "SPA 水療",
    "局部修剪", "剪指甲／清耳朵"
  ];

  const mainEl = document.getElementById("slotsMain");
  const refreshBtn = document.getElementById("btnRefresh");
  const mockBadge = document.getElementById("mockBadge");
  const footerInner = document.getElementById("footerInner");
  const headerTitle = document.getElementById("headerTitle");
  const headerSub = document.getElementById("headerSub");

  let slotsPayload = null;
  let selectedDate = "";
  let selectedTime = "";
  let authCtx = null;
  let submitting = false;

  const form = {
    date: "",
    time: "",
    petId: "",
    serviceTags: [],
    serviceCustom: "",
    note: "",
    requestId: ""
  };

  if (api.isMockMode() && mockBadge) {
    mockBadge.classList.remove("hidden");
  }

  function oaId() {
    return (slotsPayload && slotsPayload.lineOaId) || cfg.LINE_OA_ID || "@976fowuq";
  }

  function newRequestId() {
    return "BK-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function setHeader(title, sub, showRefresh) {
    if (headerTitle) headerTitle.textContent = title;
    if (headerSub) headerSub.textContent = sub;
    if (refreshBtn) refreshBtn.classList.toggle("hidden", !showRefresh);
  }

  function setFooter(html) {
    if (footerInner) footerInner.innerHTML = html;
  }

  function lineAskFooter(msg) {
    setFooter(
      '<a class="btn btn-secondary btn-block" href="' +
      api.escapeHtml(api.buildOaMessageUrl(oaId(), msg || "您好，我想詢問寵物美容可預約的時段🐾")) +
      '">💬 用 LINE 詢問店家</a>'
    );
  }

  /** 改網址參數（不重新載入），讓 LINE 登入回來或重新整理時能接續 */
  function setUrlParams(params) {
    try {
      const url = new URL(window.location.href);
      ["book", "record", "date", "time", "liff.state"].forEach(function (k) { url.searchParams.delete(k); });
      Object.keys(params || {}).forEach(function (k) {
        if (params[k]) url.searchParams.set(k, params[k]);
      });
      window.history.replaceState(null, "", url.toString());
    } catch (ignore) {
      // 舊瀏覽器忽略
    }
  }

  function renderLoading() {
    mainEl.innerHTML =
      '<div class="skeleton"></div>' +
      '<div class="skeleton" style="height: 68px;"></div>' +
      '<div class="skeleton" style="height: 220px;"></div>';
  }

  function renderError(msg, retryFn) {
    mainEl.innerHTML =
      '<div class="card">' +
      '  <div class="state-emoji" style="text-align:center;">🐾</div>' +
      '  <p style="text-align:center;margin:0 0 12px;">' + api.escapeHtml(msg) + "</p>" +
      '  <div class="btn-row">' +
      '    <button type="button" class="btn btn-primary" id="btnRetry">重新整理</button>' +
      "  </div>" +
      "</div>";
    lineAskFooter();
    document.getElementById("btnRetry").addEventListener("click", retryFn || loadSlots);
  }

  // -------------------------------------------------------------------------
  // 1. 查空檔
  // -------------------------------------------------------------------------

  function pickDefaultDate(days) {
    if (!days || !days.length) return "";
    const firstAvail = days.find(function (d) { return d.hasAvailable; });
    return firstAvail ? firstAvail.date : days[0].date;
  }

  function renderSlotsFooter(activeDay) {
    if (selectedTime && activeDay && activeDay.date === selectedDate) {
      setFooter(
        '<button type="button" class="btn btn-primary btn-block" id="btnBookSlot">預約 ' +
        api.escapeHtml(activeDay.label) + "（週" + api.escapeHtml(activeDay.weekdayLabel) + "）" + api.escapeHtml(selectedTime) +
        " ›</button>"
      );
      document.getElementById("btnBookSlot").addEventListener("click", function () {
        startBooking(selectedDate, selectedTime);
      });
    } else {
      lineAskFooter();
    }
  }

  function renderSlots() {
    if (!slotsPayload || !slotsPayload.days) return;
    setHeader("查詢可預約時段", "點選「可約」時段，就能直接線上預約", true);
    const days = slotsPayload.days;

    if (!selectedDate || !days.some(function (d) { return d.date === selectedDate; })) {
      selectedDate = pickDefaultDate(days);
      selectedTime = "";
    }

    const activeDay = days.find(function (d) { return d.date === selectedDate; }) || days[0];
    const html = [];

    html.push(
      '<div class="notice-banner">' +
      '  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">' +
      '    <strong style="color:var(--primary-dark);">預約小提醒</strong>' +
      '    <span class="muted">最後更新：' + api.escapeHtml(slotsPayload.updatedAt || "--:--") + "</span>" +
      "  </div>" +
      '  <div>' + api.escapeHtml(slotsPayload.notice || "") + "</div>" +
      "</div>"
    );

    if (!slotsPayload.calendarConfigured && !api.isMockMode()) {
      html.push(
        '<div class="alert-box" style="background:var(--amber-bg);border-color:#FCD34D;color:#92400E;">' +
        "  <div class=\"alert-box-body\">目前尚未設定日曆 ID，顯示為預設營業時段，實際檔期請在 LINE 確認喔！</div>" +
        "</div>"
      );
    }

    html.push('<div class="date-strip" id="dateStrip">');
    days.forEach(function (d) {
      const cls = ["date-pill"];
      if (d.date === activeDay.date) cls.push("active");
      if (d.closed) cls.push("closed");
      const dotClass = d.closed || !d.hasAvailable ? "dot-indicator dot-closed" : "dot-indicator dot-avail";
      const subText = d.closed ? (d.closedReason || "公休") : ("(" + d.weekdayLabel + ")");
      html.push(
        '<button type="button" class="' + cls.join(" ") + '" data-date="' + api.escapeHtml(d.date) + '">' +
        '  <span class="date-md">' + api.escapeHtml(d.label) + "</span>" +
        '  <span class="date-wd">' + api.escapeHtml(subText) + "</span>" +
        '  <span class="' + dotClass + '"></span>' +
        "</button>"
      );
    });
    html.push("</div>");

    html.push('<div class="card">');
    html.push(
      '<h2 class="card-title">' +
      "  <span>📅 " + api.escapeHtml(activeDay.label) + "（週" + api.escapeHtml(activeDay.weekdayLabel) + "）</span>" +
      '  <span class="pill">' + (activeDay.closed ? "休假日" : ("每格 " + (slotsPayload.stepMin || 60) + " 分")) + "</span>" +
      "</h2>"
    );

    if (activeDay.closed) {
      const nextAvail = days.find(function (d) { return d.hasAvailable; });
      html.push(
        '<div style="text-align:center;padding:22px 8px;">' +
        '  <div style="font-size:34px;margin-bottom:6px;">🛌</div>' +
        '  <div style="font-weight:700;margin-bottom:4px;">這天是' + api.escapeHtml(activeDay.closedReason || "公休") + "喔</div>" +
        '  <div class="muted" style="margin-bottom:14px;">我們固定週一公休，歡迎看看其他天的時段～</div>' +
        (nextAvail
          ? '<button type="button" class="btn btn-secondary btn-sm" id="btnJumpAvail" data-date="' + api.escapeHtml(nextAvail.date) + '">跳到最近可約日（' + api.escapeHtml(nextAvail.label) + "）</button>"
          : "") +
        "</div>"
      );
    } else if (!activeDay.slots || activeDay.slots.length === 0) {
      html.push('<p class="muted" style="text-align:center;padding:18px 0;">這天沒有開放時段</p>');
    } else {
      html.push('<div class="slots-grid">');
      activeDay.slots.forEach(function (slot) {
        if (slot.status === "available") {
          const isSel = selectedTime === slot.time;
          html.push(
            '<button type="button" class="slot-card slot-available" data-time="' + api.escapeHtml(slot.time) + '"' +
            (isSel ? ' style="outline:3px solid var(--primary);outline-offset:1px;"' : "") + ">" +
            '  <span class="slot-time">' + api.escapeHtml(slot.time) + "</span>" +
            '  <span class="slot-badge">' + (isSel ? "已選 ✓" : "可約 ›") + "</span>" +
            "</button>"
          );
        } else {
          html.push(
            '<div class="slot-card ' + (slot.status === "full" ? "slot-full" : "slot-unavailable") + '">' +
            '  <span class="slot-time">' + api.escapeHtml(slot.time) + "</span>" +
            '  <span class="slot-badge">' + (slot.status === "full" ? "已滿" : "不開放") + "</span>" +
            "</div>"
          );
        }
      });
      html.push("</div>");
      html.push('<p class="field-hint" style="margin-top:10px;">點選「可約」時段，再按下方「預約」按鈕就能直接線上預約。</p>');
    }

    html.push("</div>");
    mainEl.innerHTML = html.join("");
    renderSlotsFooter(activeDay);

    const strip = document.getElementById("dateStrip");
    if (strip) {
      strip.querySelectorAll("[data-date]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          selectedDate = btn.getAttribute("data-date");
          selectedTime = "";
          renderSlots();
        });
      });
    }
    mainEl.querySelectorAll("[data-time]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const t = btn.getAttribute("data-time");
        selectedTime = selectedTime === t ? "" : t;
        renderSlots();
      });
    });
    const jumpBtn = document.getElementById("btnJumpAvail");
    if (jumpBtn) {
      jumpBtn.addEventListener("click", function () {
        selectedDate = jumpBtn.getAttribute("data-date");
        selectedTime = "";
        renderSlots();
      });
    }
  }

  async function loadSlots() {
    setUrlParams({});
    renderLoading();
    const res = await api.apiGetSlots();
    if (!res || !res.ok) {
      renderError((res && res.message) || "暫時無法取得空檔資料，請稍後再試");
      return;
    }
    slotsPayload = res;
    renderSlots();
  }

  // -------------------------------------------------------------------------
  // 2. 預約表單（老客人）
  // -------------------------------------------------------------------------

  async function ensureAuth() {
    if (authCtx && authCtx.ok) return authCtx;
    authCtx = await api.initLiffAuth(LIFF_ID);
    return authCtx;
  }

  function slotLabel(date, time) {
    const f = api.formatMmDdWeekday(date);
    return f.label + (f.weekdayLabel ? "（週" + f.weekdayLabel + "）" : "") + " " + time;
  }

  async function startBooking(date, time) {
    form.date = date;
    form.time = time;
    setUrlParams({ book: date + "_" + time });
    setHeader("預約美容", slotLabel(date, time), false);
    setFooter("");
    renderLoading();

    const auth = await ensureAuth();
    if (!auth.ok) {
      if (!auth.redirecting) renderError(auth.message || "請在 LINE 裡開啟這個頁面", function () { startBooking(date, time); });
      return;
    }

    const prof = await api.apiPost("load_profile", {}, auth);
    if (!prof || !prof.ok) {
      renderError(api.errorText(prof && prof.error, prof && prof.message), function () { startBooking(date, time); });
      return;
    }
    if (prof.isNew || !prof.pets || prof.pets.length === 0) {
      renderNeedForm(date, time, prof.isNew);
      return;
    }

    form.pets = prof.pets;
    form.ownerName = (prof.owner && prof.owner.name) || "";
    if (!form.petId || !prof.pets.some(function (p) { return p.petId === form.petId; })) {
      form.petId = prof.pets.length === 1 ? prof.pets[0].petId : "";
    }
    form.requestId = newRequestId();
    renderBookForm();
  }

  function formUrlForNewCustomer(date, time) {
    const base = (cfg.PAGES && cfg.PAGES.FORM_LIFF) || "../pet-form/";
    return base + (base.indexOf("?") === -1 ? "?" : "&") +
      "date=" + encodeURIComponent(date) + "&time=" + encodeURIComponent(time) + "&from=slots";
  }

  function renderNeedForm(date, time, isNew) {
    mainEl.innerHTML =
      '<div class="card" style="text-align:center;padding:22px 16px;">' +
      '  <div class="state-emoji">📝</div>' +
      '  <h2 style="margin:0 0 8px;color:var(--primary-dark);">' + (isNew ? "第一次預約，請先填顧客單" : "請先幫毛孩建檔") + "</h2>" +
      '  <p style="margin:0 0 6px;">您選的時段：<strong>' + api.escapeHtml(slotLabel(date, time)) + "</strong></p>" +
      '  <p class="muted" style="margin:0 0 16px;">填完毛孩資料後會自動回到這裡確認預約，不用重選時段。</p>' +
      '  <a class="btn btn-primary btn-block" href="' + api.escapeHtml(formUrlForNewCustomer(date, time)) + '">填寫顧客單 ›</a>' +
      '  <button type="button" class="btn btn-outline btn-block" style="margin-top:10px;" id="btnBackSlots">重新選時段</button>' +
      "</div>";
    setFooter("");
    document.getElementById("btnBackSlots").addEventListener("click", loadSlots);
  }

  function composedService() {
    const parts = form.serviceTags.slice();
    if (form.serviceCustom.trim()) parts.push(form.serviceCustom.trim());
    return parts.join("、");
  }

  function captureForm() {
    const custom = document.getElementById("inServiceCustom");
    const note = document.getElementById("inBookNote");
    if (custom) form.serviceCustom = custom.value;
    if (note) form.note = note.value;
  }

  function renderBookForm() {
    const html = [];
    html.push('<div class="card">');
    html.push('<h2 class="card-title"><span>📅 ' + api.escapeHtml(slotLabel(form.date, form.time)) + '</span><span class="pill">預約時段</span></h2>');
    html.push('<p class="muted" style="margin:0;">' + api.escapeHtml(form.ownerName ? form.ownerName + "您好～" : "") + "請選擇要來美容的毛孩和服務項目。</p>");
    html.push("</div>");

    html.push('<div class="card">');
    html.push('<h2 class="card-title">🐾 要來的毛孩<span class="req-star">*</span></h2>');
    form.pets.forEach(function (p) {
      const active = form.petId === p.petId;
      html.push(
        '<div class="card" style="cursor:pointer;border-width:2px;border-color:' + (active ? "var(--primary)" : "var(--border)") + ';background:' + (active ? "#FFFDF9" : "#FFF") + ';" data-pick-pet="' + api.escapeHtml(p.petId) + '">' +
        '  <div style="display:flex;justify-content:space-between;align-items:center;">' +
        '    <strong style="font-size:17px;">' + (active ? "✓ " : "") + (p.species === "貓" ? "🐱 " : "🐶 ") + api.escapeHtml(p.name) + "</strong>" +
        '    <span class="pill">' + api.escapeHtml(p.species || "") + (p.breed ? "・" + api.escapeHtml(p.breed) : "") + (p.size ? "・" + api.escapeHtml(p.size) : "") + "</span>" +
        "  </div>" +
        "</div>"
      );
    });
    html.push('<p class="field-hint">要帶新的毛孩？請先到「填顧客單」幫牠建檔。</p>');
    html.push("</div>");

    html.push('<div class="card">');
    html.push('<h2 class="card-title">✂️ 服務項目<span class="req-star">*</span></h2>');
    html.push(
      '<div class="chips-grid" style="margin-bottom:8px;">' +
      SERVICE_OPTIONS.map(function (sv) {
        const sel = form.serviceTags.indexOf(sv) !== -1;
        return '<button type="button" class="chip chip-sm ' + (sel ? "selected" : "") + '" data-service="' + api.escapeHtml(sv) + '">' + api.escapeHtml(sv) + "</button>";
      }).join("") +
      "</div>" +
      '<input class="form-input" id="inServiceCustom" placeholder="其他指定項目或加購（選填）" value="' + api.escapeHtml(form.serviceCustom) + '">'
    );
    html.push(
      '<div class="form-group" style="margin:12px 0 0;">' +
      '  <label class="form-label" for="inBookNote">這次想交代的事（選填）</label>' +
      '  <textarea class="form-textarea" id="inBookNote" maxlength="500" placeholder="例如：最近皮膚有點紅、這次想剪短一點">' + api.escapeHtml(form.note) + "</textarea>" +
      "</div>"
    );
    html.push("</div>");
    mainEl.innerHTML = html.join("");

    setFooter(
      '<button type="button" class="btn btn-secondary" id="btnBookBack">重選時段</button>' +
      '<button type="button" class="btn btn-primary" style="flex:2;" id="btnBookConfirm">確認預約</button>'
    );

    mainEl.querySelectorAll("[data-pick-pet]").forEach(function (el) {
      el.addEventListener("click", function () {
        captureForm();
        form.petId = el.getAttribute("data-pick-pet");
        renderBookForm();
      });
    });
    mainEl.querySelectorAll("[data-service]").forEach(function (el) {
      el.addEventListener("click", function () {
        captureForm();
        const sv = el.getAttribute("data-service");
        const idx = form.serviceTags.indexOf(sv);
        if (idx === -1) form.serviceTags.push(sv); else form.serviceTags.splice(idx, 1);
        renderBookForm();
      });
    });
    document.getElementById("btnBookBack").addEventListener("click", function () {
      selectedDate = form.date;
      selectedTime = "";
      loadSlots();
    });
    document.getElementById("btnBookConfirm").addEventListener("click", submitBooking);
  }

  async function submitBooking() {
    if (submitting) return;
    captureForm();
    if (!form.petId) return api.showToast("請選擇要來美容的毛孩");
    const service = composedService();
    if (!service) return api.showToast("請選擇服務項目");

    submitting = true;
    const btn = document.getElementById("btnBookConfirm");
    if (btn) { btn.disabled = true; btn.textContent = "預約中…"; }
    const res = await api.apiPost("book_slot", {
      requestId: form.requestId,
      date: form.date,
      time: form.time,
      petId: form.petId,
      service: service,
      note: form.note
    }, authCtx);
    submitting = false;
    handleBookResult(res, function () {
      if (btn) { btn.disabled = false; btn.textContent = "確認預約"; }
    });
  }

  function handleBookResult(res, onFail) {
    if (res && res.ok) {
      renderDone(res);
      return;
    }
    if (res && res.error === "slot_taken") {
      api.showToast(res.message || api.errorText("slot_taken"));
      selectedDate = form.date;
      selectedTime = "";
      loadSlots();
      return;
    }
    if (res && res.error === "not_bound") {
      renderNeedForm(form.date, form.time, true);
      return;
    }
    if (onFail) onFail();
    api.showToast(api.errorText(res && res.error, res && res.message));
  }

  // -------------------------------------------------------------------------
  // 3. 新客人填完顧客單接回
  // -------------------------------------------------------------------------

  async function startResume(recordId, date, time) {
    form.date = date;
    form.time = time;
    setHeader("確認預約", "顧客單已送出", false);
    setFooter("");
    renderLoading();
    const auth = await ensureAuth();
    if (!auth.ok) {
      if (!auth.redirecting) renderError(auth.message || "請在 LINE 裡開啟這個頁面", function () { startResume(recordId, date, time); });
      return;
    }
    mainEl.innerHTML =
      '<div class="card" style="text-align:center;padding:22px 16px;">' +
      '  <div class="state-emoji">🐾</div>' +
      '  <h2 style="margin:0 0 8px;color:var(--primary-dark);">顧客單填好了！</h2>' +
      '  <p style="margin:0 0 16px;">最後一步，確認預約這個時段：<br><strong style="font-size:18px;">' + api.escapeHtml(slotLabel(date, time)) + "</strong></p>" +
      "</div>";
    setFooter('<button type="button" class="btn btn-primary btn-block" id="btnResumeConfirm">確認預約</button>');
    const btn = document.getElementById("btnResumeConfirm");
    btn.addEventListener("click", async function () {
      if (submitting) return;
      submitting = true;
      btn.disabled = true;
      btn.textContent = "預約中…";
      const res = await api.apiPost("book_slot", { recordId: recordId }, authCtx);
      submitting = false;
      if (res && !res.ok && res.error === "validation") {
        // 例如顧客單還在等店家核對身分
        mainEl.innerHTML =
          '<div class="card" style="text-align:center;padding:22px 16px;">' +
          '  <div class="state-emoji">📞</div>' +
          '  <p style="margin:0 0 12px;">' + api.escapeHtml(res.message || "") + "</p>" +
          "</div>";
        lineAskFooter("您好，我剛填好顧客單，想預約 " + slotLabel(date, time) + " 🐾");
        return;
      }
      handleBookResult(res, function () { btn.disabled = false; btn.textContent = "確認預約"; });
    });
  }

  // -------------------------------------------------------------------------
  // 4. 預約完成：訂金與回報
  // -------------------------------------------------------------------------

  function renderDone(res) {
    setUrlParams({});
    const b = res.booking || {};
    setHeader(b.status === "待付訂金" ? "時段已幫您保留" : "預約已送出", slotLabel(b.date, b.time), false);
    mainEl.innerHTML =
      '<div class="card" style="text-align:center;padding:18px 16px;">' +
      '  <div class="state-emoji">🎉</div>' +
      '  <h2 style="margin:0 0 6px;color:var(--primary-dark);">' + (res.alreadyBooked ? "這個時段已經幫您預約好了" : "預約成功！") + "</h2>" +
      (b.status === "待付訂金"
        ? '  <p style="margin:0;">請在 <strong>' + api.escapeHtml(b.deadline) + "</strong> 前匯款訂金 <strong>NT$ " + api.escapeHtml(String(b.deposit)) + "</strong>，並在下方回報帳號末五碼。</p>"
        : '  <p style="margin:0;">店家確認後就完成預約囉！</p>') +
      "</div>" +
      '<div id="bookingPayBox"></div>';
    window.PwcBookingPay.render(document.getElementById("bookingPayBox"), {
      booking: b,
      payment: res.payment || {},
      authCtx: authCtx
    });
    const recordsUrl = (cfg.PAGES && cfg.PAGES.RECORDS_LIFF) || "../pet-records/";
    setFooter(
      '<button type="button" class="btn btn-secondary" id="btnDoneSlots">回查空檔</button>' +
      '<a class="btn btn-primary" style="flex:2;" href="' + api.escapeHtml(recordsUrl) + '">查看我的紀錄</a>'
    );
    document.getElementById("btnDoneSlots").addEventListener("click", loadSlots);
  }

  // -------------------------------------------------------------------------
  // 進入點
  // -------------------------------------------------------------------------

  async function initPage() {
    renderLoading();
    if (window.liff && !api.isMockMode() && LIFF_ID) {
      try {
        await api.liffInitOnce(LIFF_ID);
      } catch (ignore) {
        // 外部瀏覽器或 LIFF 初始化失敗：仍可看空檔，按預約時再處理
      }
    }
    // 重要：liff.init 之後才讀網址參數
    const record = api.getParam("record");
    const date = api.getParam("date");
    const time = api.getParam("time");
    const book = api.getParam("book");
    if (record && /^\d{4}-\d{2}-\d{2}$/.test(date) && time) {
      startResume(record, date, time);
      return;
    }
    const m = book.match(/^(\d{4}-\d{2}-\d{2})_(\d{1,2}:\d{2})$/);
    if (m) {
      startBooking(m[1], m[2]);
      return;
    }
    loadSlots();
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadSlots);
  }
  initPage();
})();

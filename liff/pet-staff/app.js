/**
 * 07｜店家手機後台 LIFF（今日客人、搜尋、待確認對應、顧客卡、寵物頁、筆記與紀錄編輯）
 */
(function () {
  const cfg = window.PWC_CONFIG || {};
  const api = window.PwcApi;
  const viewer = window.PwcViewer;

  const mainEl = document.getElementById("staffMain");
  const navEl = document.getElementById("staffBottomNav");
  const pendingBadge = document.getElementById("navPendingBadge");
  const mockBadge = document.getElementById("mockBadge");

  if (api.isMockMode() && mockBadge) {
    mockBadge.classList.remove("hidden");
  }

  let authCtx = null;
  let activeTab = "today"; // today | search | pending
  let subView = null; // null | { kind: "customer", phone } | { kind: "pet", petId, backPhone? }
  let todayDate = api.todayIsoTaipei(0);
  let searchKeyword = "";
  let pendingFilter = "待處理";

  function shiftIsoDate(iso, deltaDays) {
    const ms = Date.parse(iso + "T00:00:00+08:00") + deltaDays * 86400000 + 8 * 3600000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  function renderLoading() {
    mainEl.innerHTML =
      '<div class="skeleton"></div>' +
      '<div class="skeleton"></div>';
  }

  function renderNotAdmin(message) {
    if (navEl) navEl.classList.add("hidden");
    const mySub = (authCtx && authCtx.sub) || "";
    mainEl.innerHTML =
      '<div class="fullscreen-state">' +
      '  <div class="state-emoji">🔒</div>' +
      '  <h2 style="margin:0 0 8px;font-size:19px;">' + api.escapeHtml(message || "此頁面僅限店家人員使用") + "</h2>" +
      '  <p class="muted" style="margin:0 0 18px;">如果您是顧客，請回到官方帳號選單點選「填顧客單」或「我的紀錄」。</p>' +
      (mySub
        ? '<details class="clean-details" style="width:100%;max-width:360px;text-align:left;">' +
          "  <summary>店家首次開通權限說明（查看我的 LINE ID）</summary>" +
          '  <p class="field-hint" style="margin:8px 0;">請將下方 LINE User ID 貼入 Google 試算表「店家名單」分頁並勾選「啟用」：</p>' +
          '  <div style="background:#FFF;padding:8px;border-radius:8px;border:1px solid var(--border);font-family:monospace;font-size:12px;word-break:break-all;margin-bottom:8px;" id="myLineSubBox">' + api.escapeHtml(mySub) + "</div>" +
          '  <button type="button" class="btn btn-secondary btn-sm btn-block" id="btnCopyMySub">複製 LINE User ID</button>' +
          "</details>"
        : "") +
      "</div>";
    const cpBtn = document.getElementById("btnCopyMySub");
    if (cpBtn && mySub) {
      cpBtn.addEventListener("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(mySub);
          api.showToast("已複製 LINE User ID");
        }
      });
    }
  }

  function updatePendingBadge(count) {
    if (!pendingBadge) return;
    if (count > 0) {
      pendingBadge.textContent = String(count);
      pendingBadge.classList.remove("hidden");
    } else {
      pendingBadge.classList.add("hidden");
    }
  }

  function setNavActive(tab) {
    activeTab = tab;
    if (!navEl) return;
    navEl.classList.remove("hidden");
    navEl.querySelectorAll("[data-tab]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab && !subView);
    });
  }

  async function refreshPendingCount() {
    const res = await api.apiPost("staff_pending_list", { status: "待處理" }, authCtx);
    if (res && res.ok) {
      updatePendingBadge((res.items || []).length);
    }
    return res;
  }

  // ---------- 新預約／待確認收款 ----------
  const bookingBadge = document.getElementById("navBookingBadge");

  function updateBookingBadge(list) {
    if (!bookingBadge) return;
    const n = (list || []).filter(function (b) { return b.status === "待確認收款" || b.status === "待店家確認"; }).length;
    bookingBadge.textContent = String(n);
    bookingBadge.classList.toggle("hidden", n === 0);
  }

  async function refreshBookingCount() {
    const res = await api.apiPost("staff_booking_list", {}, authCtx);
    if (res && res.ok) updateBookingBadge(res.bookings);
  }

  async function loadBookings() {
    subView = null;
    setNavActive("bookings");
    renderLoading();
    const res = await api.apiPost("staff_booking_list", {}, authCtx);
    if (!res || !res.ok) {
      if (res && res.error === "not_admin") return renderNotAdmin(res.message);
      mainEl.innerHTML = '<div class="card"><p class="muted">' + api.escapeHtml(api.errorText(res && res.error, res && res.message)) + "</p></div>";
      return;
    }
    updateBookingBadge(res.bookings);
    renderBookings(res);
  }

  function renderBookings(data) {
    const list = data.bookings || [];
    const groups = [
      { status: "待確認收款", title: "💰 待確認收款", hint: "客人已回報匯款，請對帳後按「確認收款」" },
      { status: "待店家確認", title: "✅ 待店家確認", hint: "" },
      { status: "待付訂金", title: "⏳ 等客人付訂金", hint: "逾期未付會在每小時檢查時自動取消並釋出時段" }
    ];
    const html = [];
    html.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 2px 10px;">' +
      '  <strong style="font-size:17px;">新預約／待確認收款</strong>' +
      '  <button type="button" class="btn btn-outline btn-sm" id="btnBookingsRefresh">重新整理</button>' +
      "</div>"
    );
    if (!list.length) {
      html.push('<div class="card" style="text-align:center;"><div class="state-emoji">🎉</div><p class="muted" style="margin:0;">目前沒有待處理的線上預約</p></div>');
    }
    groups.forEach(function (g) {
      const items = list.filter(function (b) { return b.status === g.status; });
      if (!items.length) return;
      html.push('<h2 class="card-title" style="margin:12px 2px 6px;">' + g.title + '（' + items.length + "）</h2>");
      if (g.hint) html.push('<p class="field-hint" style="margin:0 2px 8px;">' + api.escapeHtml(g.hint) + "</p>");
      items.forEach(function (b) {
        const id = api.escapeHtml(b.recordId);
        const st = api.escapeHtml(b.status);
        html.push('<div class="card">');
        html.push(
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '  <strong style="font-size:16px;">📅 ' + api.escapeHtml((b.date || "").replace(/-/g, "/")) + " " + api.escapeHtml(b.time) + "</strong>" +
          (b.overdue ? '<span class="pill pill-red">已逾期</span>' : '<span class="pill">' + id + "</span>") +
          "</div>"
        );
        html.push('<div><strong>' + api.escapeHtml(b.petName || "") + "</strong>・" + api.escapeHtml(b.service || "") + "</div>");
        html.push(
          '<div class="muted" style="margin:4px 0;">' + api.escapeHtml(b.ownerName || "") + "　" +
          (b.phone ? '<a href="tel:' + api.escapeHtml(b.phone) + '">' + api.escapeHtml(b.phone) + "</a>" : "") + "</div>"
        );
        if (b.deposit > 0) {
          html.push('<div class="muted">訂金 NT$ ' + api.escapeHtml(String(b.deposit)) + (b.deadline ? "｜期限 " + api.escapeHtml(b.deadline) : "") + "</div>");
        }
        if (b.last5) {
          html.push('<div style="margin-top:4px;"><span class="pill pill-amber">末五碼 ' + api.escapeHtml(b.last5) + "</span> " + api.escapeHtml(b.transferDate || "") + "</div>");
        }
        if (b.customerNote) {
          html.push('<div class="notice-banner" style="margin-top:8px;">客人備註：' + api.escapeHtml(b.customerNote) + "</div>");
        }
        html.push('<div class="btn-row" style="margin-top:10px;flex-wrap:wrap;">');
        if (b.status === "待確認收款" || b.status === "待付訂金") {
          html.push('<button type="button" class="btn btn-green btn-sm" data-bk-act="staff_confirm_payment" data-bk-id="' + id + '" data-bk-st="' + st + '">確認收款</button>');
          html.push('<button type="button" class="btn btn-outline btn-sm" data-bk-act="staff_extend_booking" data-bk-id="' + id + '" data-bk-st="' + st + '">延長期限</button>');
        }
        if (b.status === "待店家確認") {
          html.push('<button type="button" class="btn btn-green btn-sm" data-bk-act="staff_confirm_booking" data-bk-id="' + id + '" data-bk-st="' + st + '">確認預約</button>');
        }
        html.push('<button type="button" class="btn btn-danger btn-sm" data-bk-act="staff_cancel_booking" data-bk-id="' + id + '" data-bk-st="' + st + '">取消預約</button>');
        html.push("</div></div>");
      });
    });
    mainEl.innerHTML = html.join("");

    document.getElementById("btnBookingsRefresh").addEventListener("click", loadBookings);
    mainEl.querySelectorAll("[data-bk-act]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const act = btn.getAttribute("data-bk-act");
        const params = { recordId: btn.getAttribute("data-bk-id"), expectedStatus: btn.getAttribute("data-bk-st") };
        if (act === "staff_cancel_booking") {
          const reason = window.prompt("確定要取消這筆預約嗎？時段會馬上釋出。\n可以寫一下原因（選填）：", "");
          if (reason === null) return;
          params.reason = reason;
        }
        if (act === "staff_confirm_payment" && params.expectedStatus === "待付訂金" &&
            !window.confirm("客人還沒回報匯款，確定已經收到訂金了嗎？")) {
          return;
        }
        btn.disabled = true;
        const res = await api.apiPost(act, params, authCtx);
        if (!res || !res.ok) {
          btn.disabled = false;
          api.showToast(api.errorText(res && res.error, res && res.message));
          if (res && res.error === "stale") loadBookings();
          return;
        }
        api.showToast(act === "staff_extend_booking" ? "付款期限已延長到 " + (res.deadline || "") : "已更新為「" + res.status + "」");
        loadBookings();
      });
    });
  }

  // ---------- 今日客人 ----------
  async function loadToday() {
    subView = null;
    setNavActive("today");
    renderLoading();
    const res = await api.apiPost("staff_today", { date: todayDate }, authCtx);
    if (!res || !res.ok) {
      if (res && res.error === "not_admin") return renderNotAdmin(res.message);
      mainEl.innerHTML = '<div class="card"><p class="muted">' + api.escapeHtml(api.errorText(res && res.error, res && res.message)) + "</p></div>";
      return;
    }
    renderToday(res);
  }

  function renderToday(data) {
    const events = data.events || [];
    const html = [];
    html.push(
      '<div class="card">' +
      '  <div style="display:flex;gap:8px;align-items:center;">' +
      '    <button type="button" class="btn btn-secondary btn-sm" id="btnPrevDay">‹ 前一天</button>' +
      '    <input type="date" class="form-input" id="inTodayDate" style="min-height:38px;text-align:center;flex:1;" value="' + api.escapeHtml(todayDate) + '">' +
      '    <button type="button" class="btn btn-secondary btn-sm" id="btnNextDay">後一天 ›</button>' +
      "  </div>" +
      "</div>"
    );

    if (!data.calendarConfigured && !api.isMockMode()) {
      html.push('<div class="notice-banner">尚未在試算表「設定」填入 <code>calendar_id</code>，目前無法讀取 Google 行事曆預約。</div>');
    } else if (events.length === 0) {
      html.push('<div class="card" style="text-align:center;padding:28px 12px;"><div style="font-size:32px;">☕</div><p class="muted" style="margin:6px 0 0;">這天日曆沒有預約行程</p></div>');
    } else {
      events.forEach(function (ev) {
        const c = ev.customer;
        const timeStr = ev.isAllDay ? "全天" : (ev.startTime + "–" + ev.endTime);
        const matchLabel =
          ev.matchType === "phone" ? '<span class="pill pill-green">已對上</span>' :
          ev.matchType === "fuzzy_single" ? '<span class="pill pill-amber">名字比對</span>' :
          ev.matchType === "fuzzy_multiple" ? '<span class="pill pill-amber">多位同名</span>' :
          '<span class="pill pill-red">未對應</span>';

        html.push('<div class="card">');
        html.push(
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">' +
          '  <strong>⏰ ' + api.escapeHtml(timeStr) + "｜" + api.escapeHtml(ev.title || "(無標題)") + "</strong>" +
          "  " + matchLabel +
          "</div>"
        );

        if (c) {
          if (c.alert) {
            html.push('<div class="alert-box" style="margin-bottom:8px;"><div class="alert-box-body">⚠️ ' + api.escapeHtml(c.alert) + "</div></div>");
          }
          if (c.hasPendingBind) {
            html.push('<div class="pill pill-red" style="margin-bottom:8px;">有待確認 LINE 綁定項目</div>');
          }
          html.push(
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '  <span>👤 <strong>' + api.escapeHtml(c.name) + '</strong>（<a href="tel:' + api.escapeHtml(c.phone) + '">' + api.escapeHtml(c.phone) + "</a>）</span>" +
            '  <button type="button" class="btn btn-outline btn-sm" data-open-cust="' + api.escapeHtml(c.phone) + '">顧客卡 ›</button>' +
            "</div>"
          );
          if (c.pets && c.pets.length) {
            html.push('<div class="chips-grid">');
            c.pets.forEach(function (p) {
              const hasNote = Boolean(p.groomingNote);
              html.push(
                '<button type="button" class="chip chip-sm" data-open-pet="' + api.escapeHtml(p.petId) + '" data-from-phone="' + api.escapeHtml(c.phone) + '">' +
                (hasNote ? "⚠️ " : "🐾 ") + api.escapeHtml(p.name) +
                "</button>"
              );
            });
            html.push("</div>");
          }
        } else {
          html.push(
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '  <span class="muted">找不到對應顧客資料</span>' +
            '  <button type="button" class="btn btn-primary btn-sm" data-link-event="' + api.escapeHtml(ev.eventId) + '" data-event-title="' + api.escapeHtml(ev.title) + '">指定顧客</button>' +
            "</div>"
          );
        }
        html.push("</div>");
      });
    }

    mainEl.innerHTML = html.join("");
    document.getElementById("btnPrevDay").addEventListener("click", function () {
      todayDate = shiftIsoDate(todayDate, -1);
      loadToday();
    });
    document.getElementById("btnNextDay").addEventListener("click", function () {
      todayDate = shiftIsoDate(todayDate, 1);
      loadToday();
    });
    document.getElementById("inTodayDate").addEventListener("change", function (e) {
      if (e.target.value) {
        todayDate = e.target.value;
        loadToday();
      }
    });

    mainEl.querySelectorAll("[data-open-cust]").forEach(function (btn) {
      btn.addEventListener("click", function () { openCustomerCard(btn.getAttribute("data-open-cust")); });
    });
    mainEl.querySelectorAll("[data-open-pet]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPetPage(btn.getAttribute("data-open-pet"), btn.getAttribute("data-from-phone"));
      });
    });
    mainEl.querySelectorAll("[data-link-event]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const evId = btn.getAttribute("data-link-event");
        const evObj = events.find(function (x) { return x.eventId === evId; });
        openLinkEventModal(evObj || { eventId: evId, title: btn.getAttribute("data-event-title"), candidates: [] });
      });
    });
  }

  function openLinkEventModal(ev) {
    openSheetModal("將日曆行程指定給顧客", function (bodyEl, closeFn) {
      bodyEl.innerHTML =
        '<p class="muted" style="margin:0 0 10px;">行程：<strong>' + api.escapeHtml(ev.title || "") + "</strong></p>" +
        (ev.candidates && ev.candidates.length
          ? '<div class="form-group"><label class="form-label">可能符合的顧客</label><div class="chips-grid" id="candChips">' +
            ev.candidates.map(function (c) {
              return '<button type="button" class="chip chip-sm" data-cand-phone="' + api.escapeHtml(c.phone) + '">' + api.escapeHtml(c.name) + "（" + api.escapeHtml(c.phone) + "）</button>";
            }).join("") +
            "</div></div>"
          : "") +
        '<div class="form-group">' +
        '  <label class="form-label">搜尋顧客或輸入完整電話</label>' +
        '  <div style="display:flex;gap:8px;">' +
        '    <input class="form-input" id="inLinkSearch" placeholder="輸入名字、毛孩或電話">' +
        '    <button type="button" class="btn btn-secondary" id="btnLinkSearch">查</button>' +
        "  </div>" +
        "</div>" +
        '<div id="linkSearchResults"></div>';

      async function assignPhone(phone) {
        const res = await api.apiPost("staff_link_event", { eventId: ev.eventId, phone: phone }, authCtx);
        if (!res || !res.ok) return api.showToast(api.errorText(res && res.error, res && res.message));
        api.showToast("已指定給 " + (res.customerName || phone));
        closeFn();
        loadToday();
      }

      bodyEl.querySelectorAll("[data-cand-phone]").forEach(function (b) {
        b.addEventListener("click", function () { assignPhone(b.getAttribute("data-cand-phone")); });
      });

      document.getElementById("btnLinkSearch").addEventListener("click", async function () {
        const kw = document.getElementById("inLinkSearch").value.trim();
        const res = await api.apiPost("staff_search", { keyword: kw }, authCtx);
        const box = document.getElementById("linkSearchResults");
        if (!res || !res.ok) {
          box.innerHTML = '<p class="muted">' + api.escapeHtml(api.errorText(res && res.error, res && res.message)) + "</p>";
          return;
        }
        if (!res.customers || res.customers.length === 0) {
          box.innerHTML = '<p class="muted">找不到符合的顧客</p>';
          return;
        }
        box.innerHTML = res.customers.map(function (c) {
          return (
            '<div class="card" style="padding:10px;display:flex;justify-content:space-between;align-items:center;">' +
            "  <div><strong>" + api.escapeHtml(c.name) + '</strong> <span class="muted">' + api.escapeHtml(c.phone) + "</span></div>" +
            '  <button type="button" class="btn btn-primary btn-sm" data-assign-phone="' + api.escapeHtml(c.phone) + '">選擇</button>' +
            "</div>"
          );
        }).join("");
        box.querySelectorAll("[data-assign-phone]").forEach(function (b) {
          b.addEventListener("click", function () { assignPhone(b.getAttribute("data-assign-phone")); });
        });
      });
    });
  }

  // ---------- 搜尋 ----------
  async function loadSearch() {
    subView = null;
    setNavActive("search");
    renderSearchShell([]);
    await runSearch();
  }

  function renderSearchShell(customers, loading, total) {
    const html = [];
    html.push(
      '<div class="card">' +
      '  <div style="display:flex;gap:8px;">' +
      '    <input class="form-input" id="inStaffKeyword" placeholder="搜尋電話後幾碼、飼主或寵物名" value="' + api.escapeHtml(searchKeyword) + '">' +
      '    <button type="button" class="btn btn-primary" id="btnDoSearch">搜尋</button>' +
      "  </div>" +
      "</div>"
    );
    if (loading) {
      html.push('<div class="skeleton"></div>');
    } else if (!customers || customers.length === 0) {
      html.push('<div class="card" style="text-align:center;padding:24px 12px;"><p class="muted" style="margin:0;">找不到符合的顧客，請確認電話或名字喔！</p></div>');
    } else {
      if (total > customers.length) {
        html.push('<p class="muted" style="margin:0 0 8px;">僅顯示前 ' + customers.length + " 筆（共 " + total + " 筆），建議輸入更精確關鍵字。</p>");
      }
      customers.forEach(function (c) {
        html.push('<div class="card">');
        html.push(
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '  <span>' + (c.hasAlert ? '<span class="pill pill-red" style="margin-right:4px;">警示</span>' : "") + "<strong>" + api.escapeHtml(c.name) + "</strong></span>" +
          '  <button type="button" class="btn btn-outline btn-sm" data-open-cust="' + api.escapeHtml(c.phone) + '">顧客卡 ›</button>' +
          "</div>" +
          '<div class="muted" style="margin-bottom:8px;">📞 ' + api.escapeHtml(c.phone) + "</div>"
        );
        if (c.pets && c.pets.length) {
          html.push('<div class="chips-grid">');
          c.pets.forEach(function (p) {
            html.push(
              '<button type="button" class="chip chip-sm" data-open-pet="' + api.escapeHtml(p.petId) + '" data-from-phone="' + api.escapeHtml(c.phone) + '">' +
              "🐾 " + api.escapeHtml(p.name) + (p.breed ? "（" + api.escapeHtml(p.breed) + "）" : "") +
              "</button>"
            );
          });
          html.push("</div>");
        }
        html.push("</div>");
      });
    }
    mainEl.innerHTML = html.join("");

    const kwIn = document.getElementById("inStaffKeyword");
    const doSearch = function () {
      searchKeyword = kwIn.value.trim();
      runSearch();
    };
    document.getElementById("btnDoSearch").addEventListener("click", doSearch);
    kwIn.addEventListener("keydown", function (e) {
      if (e.key === "Enter") doSearch();
    });
    mainEl.querySelectorAll("[data-open-cust]").forEach(function (b) {
      b.addEventListener("click", function () { openCustomerCard(b.getAttribute("data-open-cust")); });
    });
    mainEl.querySelectorAll("[data-open-pet]").forEach(function (b) {
      b.addEventListener("click", function () { openPetPage(b.getAttribute("data-open-pet"), b.getAttribute("data-from-phone")); });
    });
  }

  async function runSearch() {
    renderSearchShell([], true, 0);
    const res = await api.apiPost("staff_search", { keyword: searchKeyword }, authCtx);
    if (!res || !res.ok) {
      if (res && res.error === "not_admin") return renderNotAdmin(res.message);
      api.showToast(api.errorText(res && res.error, res && res.message));
      renderSearchShell([], false, 0);
      return;
    }
    renderSearchShell(res.customers || [], false, res.total || 0);
  }

  // ---------- 顧客卡 ----------
  async function openCustomerCard(phone) {
    subView = { kind: "customer", phone: phone };
    setNavActive(activeTab);
    renderLoading();
    const res = await api.apiPost("staff_customer", { phone: phone }, authCtx);
    if (!res || !res.ok) {
      api.showToast(api.errorText(res && res.error, res && res.message));
      return loadToday();
    }
    renderCustomerCard(res);
  }

  function renderCustomerCard(data) {
    const c = data.customer || {};
    const pets = data.pets || [];
    const pendingItems = data.pendingItems || [];
    const html = [];

    html.push('<button type="button" class="btn btn-secondary btn-sm" id="btnCustBack" style="margin-bottom:10px;">← 返回</button>');

    // 置頂紅字注意事項
    if (c.alert) {
      html.push(
        '<div class="alert-box">' +
        '  <div class="alert-box-title"><span>🚨 顧客注意事項（不顯示於客人端）</span><button type="button" class="btn btn-danger btn-sm" data-add-cust-note="注意事項">＋新增</button></div>' +
        '  <div class="alert-box-body">' + api.escapeHtml(c.alert) + "</div>" +
        "</div>"
      );
    } else {
      html.push(
        '<div class="pref-box" style="display:flex;justify-content:space-between;align-items:center;">' +
        '  <span class="muted">尚無顧客注意事項</span>' +
        '  <button type="button" class="btn btn-outline btn-sm" data-add-cust-note="注意事項">＋ 新增注意事項</button>' +
        "</div>"
      );
    }

    html.push('<div class="card">');
    html.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '  <h2 class="card-title" style="margin:0;">👤 ' + api.escapeHtml(c.name) + "</h2>" +
      '  <a class="btn btn-green btn-sm" href="tel:' + api.escapeHtml(c.phone) + '">📞 一鍵撥號</a>' +
      "</div>"
    );
    html.push(
      '<div class="summary-row"><span class="summary-k">電話</span><span class="summary-v">' + api.escapeHtml(c.phone) + "</span></div>" +
      '<div class="summary-row"><span class="summary-k">LINE 綁定</span><span class="summary-v">' + (c.lineUserId ? '<span class="pill pill-green">已綁定</span>' : '<span class="pill pill-amber">未綁定</span>') + "</span></div>" +
      '<div class="summary-row"><span class="summary-k">偏好</span><span class="summary-v">' + api.escapeHtml(c.preference || "無") + "</span></div>" +
      '<div class="summary-row"><span class="summary-k">飼主備註</span><span class="summary-v">' + api.escapeHtml(c.note || "無") + "</span></div>" +
      '<div class="summary-row"><span class="summary-k">管理者備註</span><span class="summary-v">' + api.escapeHtml(c.staffNote || "無") + "</span></div>"
    );
    html.push(
      '<div class="btn-row" style="margin-top:10px;">' +
      '  <button type="button" class="btn btn-secondary btn-sm" data-add-cust-note="偏好">＋ 偏好</button>' +
      '  <button type="button" class="btn btn-secondary btn-sm" data-add-cust-note="管理者備註">＋ 管理者備註</button>' +
      "</div>"
    );
    html.push("</div>");

    if (pendingItems.length > 0) {
      html.push('<div class="notice-banner">⚠️ 這位顧客目前有 ' + pendingItems.length + ' 筆待確認對應，請至「待確認」分頁處理。</div>');
    }

    html.push('<div class="card"><h3 class="card-title">🐾 名下毛孩（' + pets.length + "）</h3>");
    if (pets.length === 0) {
      html.push('<p class="muted" style="margin:0;">尚無寵物資料</p>');
    } else {
      pets.forEach(function (p) {
        html.push(
          '<div class="card" style="cursor:pointer;margin-bottom:8px;" data-open-pet="' + api.escapeHtml(p.petId) + '">' +
          '  <div style="display:flex;justify-content:space-between;align-items:center;">' +
          '    <strong>' + (p.groomingNote ? "⚠️ " : "🐾 ") + api.escapeHtml(p.name) + "</strong>" +
          '    <span class="pill">' + api.escapeHtml(p.species || "") + (p.breed ? "・" + api.escapeHtml(p.breed) : "") + "</span>" +
          "  </div>" +
          '  <div class="muted" style="margin-top:4px;">來店 ' + api.escapeHtml(p.visitCount || 0) + " 次" + (p.lastVisitDate ? ("｜上次 " + api.escapeHtml(p.lastVisitDate)) : "") + "</div>" +
          "</div>"
        );
      });
    }
    html.push("</div>");

    mainEl.innerHTML = html.join("");
    document.getElementById("btnCustBack").addEventListener("click", function () {
      if (activeTab === "search") loadSearch();
      else if (activeTab === "pending") loadPending();
      else if (activeTab === "bookings") loadBookings();
      else loadToday();
    });
    mainEl.querySelectorAll("[data-add-cust-note]").forEach(function (b) {
      b.addEventListener("click", function () {
        openAddNoteModal("顧客" + b.getAttribute("data-add-cust-note"), function (text) {
          return api.apiPost("staff_add_customer_note", { phone: c.phone, field: b.getAttribute("data-add-cust-note"), note: text }, authCtx);
        }, function () { openCustomerCard(c.phone); });
      });
    });
    mainEl.querySelectorAll("[data-open-pet]").forEach(function (card) {
      card.addEventListener("click", function () {
        openPetPage(card.getAttribute("data-open-pet"), c.phone);
      });
    });
  }

  // ---------- 寵物頁 ----------
  async function openPetPage(petId, backPhone) {
    subView = { kind: "pet", petId: petId, backPhone: backPhone };
    setNavActive(activeTab);
    renderLoading();
    const res = await api.apiPost("staff_pet", { petId: petId }, authCtx);
    if (!res || !res.ok) {
      api.showToast(api.errorText(res && res.error, res && res.message));
      return loadToday();
    }
    renderPetPage(res, backPhone);
  }

  function renderPetPage(data, backPhone) {
    const pet = data.pet || {};
    const cust = data.customer || {};
    const stats = data.stats || {};
    const records = data.records || [];
    const html = [];

    html.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '  <button type="button" class="btn btn-secondary btn-sm" id="btnPetBack">← 返回</button>' +
      (cust.phone ? '<button type="button" class="btn btn-outline btn-sm" id="btnPetToCust">👤 ' + api.escapeHtml(cust.name || "顧客卡") + "</button>" : "") +
      "</div>"
    );

    if (pet.groomingNote) {
      html.push(
        '<div class="alert-box">' +
        '  <div class="alert-box-title"><span>🚨 美容筆記（內部警示）</span><button type="button" class="btn btn-danger btn-sm" id="btnAddPetNote">＋新增</button></div>' +
        '  <div class="alert-box-body">' + api.escapeHtml(pet.groomingNote) + "</div>" +
        "</div>"
      );
    } else {
      html.push(
        '<div class="pref-box" style="display:flex;justify-content:space-between;align-items:center;">' +
        '  <span class="muted">尚無美容筆記</span>' +
        '  <button type="button" class="btn btn-outline btn-sm" id="btnAddPetNote">＋ 新增美容筆記</button>' +
        "</div>"
      );
    }

    html.push('<div class="card">');
    html.push(
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '  <h2 class="card-title" style="margin:0;">🐾 ' + api.escapeHtml(pet.name) + "</h2>" +
      '  <span class="pill">' + api.escapeHtml(pet.species || "") + (pet.breed ? "・" + api.escapeHtml(pet.breed) : "") + "</span>" +
      "</div>" +
      '<div class="muted" style="margin-bottom:10px;">' +
      [pet.size, pet.weight ? (pet.weight + " kg") : "", pet.age].filter(Boolean).join("｜") +
      "</div>" +
      (pet.personality ? '<div style="font-size:13.5px;margin-bottom:4px;"><strong>個性：</strong>' + api.escapeHtml(pet.personality) + "</div>" : "") +
      (pet.healthNote ? '<div style="font-size:13.5px;"><strong>健康：</strong>' + api.escapeHtml(pet.healthNote) + "</div>" : "")
    );
    html.push("</div>");

    html.push('<div class="stats-grid">');
    html.push(statTile("來店次數", (stats.visitCount || 0) + " 次"));
    html.push(statTile("上次來店", stats.lastVisitDate || "—"));
    html.push(statTile("平均間隔", stats.avgIntervalDays ? (stats.avgIntervalDays + " 天") : "—"));
    html.push(statTile("累計消費", "NT$ " + Number(stats.totalSpent || 0).toLocaleString("en-US")));
    html.push("</div>");
    html.push('<div class="notice-banner" style="display:flex;justify-content:space-between;"><span>建議下次預約日期</span><strong>' + api.escapeHtml(stats.nextSuggestedDate || "—") + "</strong></div>");

    html.push('<button type="button" class="btn btn-primary btn-block" id="btnNewRecord" style="margin-bottom:12px;">＋ 新增本次美容紀錄</button>');

    if (records.length === 0) {
      html.push('<div class="card"><p class="muted" style="text-align:center;margin:0;">尚無美容紀錄</p></div>');
    } else {
      records.forEach(function (rec) {
        html.push('<div class="card">');
        html.push(
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '  <strong>📅 ' + api.escapeHtml(rec.date || "") + (rec.time ? " " + api.escapeHtml(rec.time) : "") + "</strong>" +
          '  <button type="button" class="btn btn-secondary btn-sm" data-edit-rec="' + api.escapeHtml(rec.recordId) + '">編輯</button>' +
          "</div>" +
          '<div style="font-size:14px;">' +
          "  <div><strong>服務：</strong>" + api.escapeHtml(rec.service || "—") + "</div>" +
          (rec.groomingStyle ? "  <div><strong>造型：</strong>" + api.escapeHtml(rec.groomingStyle) + "</div>" : "") +
          (rec.blade ? "  <div><strong>刀頭：</strong>" + api.escapeHtml(rec.blade) + "</div>" : "") +
          (rec.behavior ? "  <div><strong>行為：</strong>" + api.escapeHtml(rec.behavior) + "</div>" : "") +
          (rec.staffNote ? "  <div><strong>店家備註：</strong>" + api.escapeHtml(rec.staffNote) + "</div>" : "") +
          "  <div><strong>金額／狀態：</strong>" + (rec.amount !== null ? ("NT$ " + rec.amount) : "—") + "（" + api.escapeHtml(rec.paymentStatus || "未收款") + "）</div>" +
          "</div>" +
          '<div class="btn-row" style="margin-top:8px;">' +
          (rec.customerSheetId ? '<button type="button" class="btn btn-outline btn-sm" data-staff-doc="customer_sheet" data-doc-id="' + api.escapeHtml(rec.customerSheetId) + '">📄 顧客單</button>' : "") +
          (rec.receiptNo ? '<button type="button" class="btn btn-outline btn-sm" data-staff-doc="receipt" data-doc-id="' + api.escapeHtml(rec.receiptNo) + '">🧾 收據</button>' : "") +
          "</div>"
        );
        html.push("</div>");
      });
    }

    mainEl.innerHTML = html.join("");
    document.getElementById("btnPetBack").addEventListener("click", function () {
      if (backPhone || cust.phone) openCustomerCard(backPhone || cust.phone);
      else loadToday();
    });
    const toCust = document.getElementById("btnPetToCust");
    if (toCust) toCust.addEventListener("click", function () { openCustomerCard(cust.phone); });

    document.getElementById("btnAddPetNote").addEventListener("click", function () {
      openAddNoteModal("寵物美容筆記（置頂紅字）", function (text) {
        return api.apiPost("staff_add_pet_note", { petId: pet.petId, note: text }, authCtx);
      }, function () { openPetPage(pet.petId, backPhone); });
    });

    document.getElementById("btnNewRecord").addEventListener("click", function () {
      openEditRecordModal(pet.petId, null, function () { openPetPage(pet.petId, backPhone); });
    });

    mainEl.querySelectorAll("[data-edit-rec]").forEach(function (b) {
      b.addEventListener("click", function () {
        const recId = b.getAttribute("data-edit-rec");
        const found = records.find(function (r) { return r.recordId === recId; });
        openEditRecordModal(pet.petId, found, function () { openPetPage(pet.petId, backPhone); });
      });
    });

    mainEl.querySelectorAll("[data-staff-doc]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const type = b.getAttribute("data-staff-doc");
        const id = b.getAttribute("data-doc-id");
        const res = await api.apiPost("get_document", { type: type, id: id }, authCtx);
        if (!res || !res.ok) return api.showToast(api.errorText(res && res.error, res && res.message));
        viewer.openPdfModal({ title: id, filename: res.filename || (id + ".pdf"), base64: res.base64 });
      });
    });
  }

  function statTile(label, value) {
    return '<div class="stat-tile"><div class="stat-label">' + api.escapeHtml(label) + '</div><div class="stat-value">' + api.escapeHtml(value) + "</div></div>";
  }

  function openAddNoteModal(title, submitFn, onDone) {
    openSheetModal("新增" + title, function (bodyEl, closeFn) {
      bodyEl.innerHTML =
        '<div class="form-group">' +
        '  <label class="form-label">內容（送出會自動附上日期與您的名字）</label>' +
        '  <textarea class="form-textarea" id="inNoteContent" placeholder="輸入注意事項或紀錄…"></textarea>' +
        "</div>" +
        '<button type="button" class="btn btn-primary btn-block" id="btnSaveNote">儲存</button>';
      document.getElementById("btnSaveNote").addEventListener("click", async function () {
        const txt = document.getElementById("inNoteContent").value.trim();
        if (!txt) return api.showToast("請輸入內容");
        const res = await submitFn(txt);
        if (!res || !res.ok) return api.showToast(api.errorText(res && res.error, res && res.message));
        api.showToast("已新增");
        closeFn();
        onDone();
      });
    });
  }

  function openEditRecordModal(petId, rec, onDone) {
    const isEdit = Boolean(rec);
    openSheetModal(isEdit ? ("編輯紀錄 " + rec.recordId) : "新增美容紀錄", function (bodyEl, closeFn) {
      const r = rec || {
        date: api.todayIsoTaipei(0),
        time: "14:00",
        service: "",
        groomingStyle: "",
        blade: "",
        behavior: "",
        amount: "",
        photoLinks: "",
        staffNote: "",
        paymentStatus: "未收款",
        paymentMethod: "",
        signedBack: false
      };
      bodyEl.innerHTML =
        '<div class="form-group"><label class="form-label">日期</label><input class="form-input" id="rDate" type="date" value="' + api.escapeHtml(r.date || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">時段</label><input class="form-input" id="rTime" placeholder="14:00" value="' + api.escapeHtml(r.time || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">服務項目</label><input class="form-input" id="rService" value="' + api.escapeHtml(r.service || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">本次造型（客人看得到）</label><input class="form-input" id="rStyle" placeholder="例如：泰迪頭、全身留 1cm" value="' + api.escapeHtml(r.groomingStyle || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">刀頭（內部）</label><input class="form-input" id="rBlade" placeholder="例如：身體 #4F" value="' + api.escapeHtml(r.blade || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">本次行為（內部）</label><input class="form-input" id="rBehav" placeholder="例如：乖巧配合、剪指甲稍微緊張" value="' + api.escapeHtml(r.behavior || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">金額（元）</label><input class="form-input" id="rAmount" type="number" inputmode="numeric" value="' + api.escapeHtml(r.amount === null || r.amount === undefined ? "" : r.amount) + '"></div>' +
        '<div class="form-group"><label class="form-label">收款狀態</label>' +
        '  <select class="form-select" id="rPayStatus">' +
        ["未收款", "已收款", "已作廢"].map(function (st) {
          return '<option value="' + st + '"' + (r.paymentStatus === st ? " selected" : "") + ">" + st + "</option>";
        }).join("") +
        "  </select></div>" +
        '<div class="form-group"><label class="form-label">付款方式</label><input class="form-input" id="rPayMethod" placeholder="現金 / 轉帳" value="' + api.escapeHtml(r.paymentMethod || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">照片雲端連結（選填）</label><input class="form-input" id="rPhotos" placeholder="Google 雲端硬碟資料夾或照片網址" value="' + api.escapeHtml(r.photoLinks || "") + '"></div>' +
        '<div class="form-group"><label class="form-label">店家備註（內部）</label><textarea class="form-textarea" id="rStaffNote">' + api.escapeHtml(r.staffNote || "") + "</textarea></div>" +
        '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;"><input type="checkbox" id="rSigned" ' + (r.signedBack ? "checked" : "") + ' style="width:20px;height:20px;"><span>顧客單已簽回歸檔</span></label>' +
        '<button type="button" class="btn btn-primary btn-block" id="btnSaveRec">儲存紀錄</button>';

      document.getElementById("btnSaveRec").addEventListener("click", async function () {
        const params = {
          petId: petId,
          fields: {
            "日期": document.getElementById("rDate").value,
            "時段": document.getElementById("rTime").value.trim(),
            "服務": document.getElementById("rService").value.trim(),
            "本次造型": document.getElementById("rStyle").value.trim(),
            "刀頭": document.getElementById("rBlade").value.trim(),
            "本次行為": document.getElementById("rBehav").value.trim(),
            "金額": document.getElementById("rAmount").value.trim(),
            "收款狀態": document.getElementById("rPayStatus").value,
            "付款方式": document.getElementById("rPayMethod").value.trim(),
            "照片連結": document.getElementById("rPhotos").value.trim(),
            "店家備註": document.getElementById("rStaffNote").value.trim(),
            "已簽回": document.getElementById("rSigned").checked
          }
        };
        if (isEdit) {
          params.recordId = rec.recordId;
          params.expectedVersion = rec.version;
        }
        const res = await api.apiPost("staff_save_record", params, authCtx);
        if (!res || !res.ok) {
          api.showToast(api.errorText(res && res.error, res && res.message));
          if (res && res.error === "stale") {
            closeFn();
            onDone();
          }
          return;
        }
        api.showToast("已儲存");
        closeFn();
        onDone();
      });
    });
  }

  // ---------- 待確認對應 ----------
  async function loadPending() {
    subView = null;
    setNavActive("pending");
    renderLoading();
    const res = await api.apiPost("staff_pending_list", { status: pendingFilter }, authCtx);
    if (!res || !res.ok) {
      if (res && res.error === "not_admin") return renderNotAdmin(res.message);
      mainEl.innerHTML = '<div class="card"><p class="muted">' + api.escapeHtml(api.errorText(res && res.error, res && res.message)) + "</p></div>";
      return;
    }
    const openCount = (res.items || []).filter(function (i) { return i.status === "待處理"; }).length;
    if (pendingFilter === "待處理") updatePendingBadge(openCount);
    renderPending(res.items || []);
  }

  function renderPending(items) {
    const html = [];
    html.push(
      '<div class="chips-grid" style="margin-bottom:12px;">' +
      '  <button type="button" class="chip chip-sm ' + (pendingFilter === "待處理" ? "selected" : "") + '" data-pf="待處理">待處理</button>' +
      '  <button type="button" class="chip chip-sm ' + (pendingFilter === "ALL" ? "selected" : "") + '" data-pf="ALL">全部紀錄</button>' +
      "</div>"
    );

    if (items.length === 0) {
      html.push('<div class="card" style="text-align:center;padding:28px 12px;"><div style="font-size:32px;">✅</div><p class="muted" style="margin:6px 0 0;">目前沒有待確認項目</p></div>');
    } else {
      items.forEach(function (it) {
        const isPending = it.status === "待處理";
        const isBind = it.reason === "首次綁定待確認" || it.reason === "同電話不同 LINE 帳號";
        html.push('<div class="card">');
        html.push(
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '  <strong>' + api.escapeHtml(it.pendingId) + "｜" + api.escapeHtml(it.reason) + "</strong>" +
          '  <span class="pill ' + (isPending ? "pill-red" : "pill-green") + '">' + api.escapeHtml(it.status) + "</span>" +
          "</div>" +
          '<div style="font-size:14px;">' +
          "  <div>表單電話：" + api.escapeHtml(it.formPhone || "—") + "</div>" +
          "  <div>飼主／毛孩：" + api.escapeHtml(it.formOwnerName || "—") + " ／ " + api.escapeHtml(it.formPetName || "—") + (it.formBreed ? "（" + api.escapeHtml(it.formBreed) + "）" : "") + "</div>" +
          (it.recordId ? '<div class="muted">關聯紀錄：' + api.escapeHtml(it.recordId) + "</div>" : "") +
          "</div>"
        );
        if (isPending) {
          html.push('<div class="btn-row" style="margin-top:10px;">');
          if (isBind && it.sourceLineId) {
            html.push('<button type="button" class="btn btn-primary btn-sm" data-resolve="confirm_bind" data-pid="' + api.escapeHtml(it.pendingId) + '">確認綁定</button>');
          }
          html.push('<button type="button" class="btn btn-secondary btn-sm" data-resolve="merge" data-pid="' + api.escapeHtml(it.pendingId) + '">合併</button>');
          html.push('<button type="button" class="btn btn-outline btn-sm" data-resolve="create_new" data-pid="' + api.escapeHtml(it.pendingId) + '">建新資料</button>');
          html.push('<button type="button" class="btn btn-outline btn-sm" data-resolve="skip" data-pid="' + api.escapeHtml(it.pendingId) + '">略過</button>');
          html.push("</div>");
        }
        html.push("</div>");
      });
    }

    mainEl.innerHTML = html.join("");
    mainEl.querySelectorAll("[data-pf]").forEach(function (b) {
      b.addEventListener("click", function () {
        pendingFilter = b.getAttribute("data-pf");
        loadPending();
      });
    });

    mainEl.querySelectorAll("[data-resolve]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const pid = b.getAttribute("data-pid");
        const mode = b.getAttribute("data-resolve");
        const item = items.find(function (x) { return x.pendingId === pid; });
        if (mode === "skip") {
          const res = await api.apiPost("staff_pending_resolve", { pendingId: pid, resolution: "skip" }, authCtx);
          if (!res || !res.ok) return api.showToast(api.errorText(res && res.error, res && res.message));
          api.showToast("已標記略過");
          await refreshPendingCount();
          return loadPending();
        }
        openResolveModal(item, mode);
      });
    });
  }

  function openResolveModal(item, mode) {
    const labelMap = { confirm_bind: "確認綁定 LINE", merge: "合併到既有顧客", create_new: "建立新顧客與毛孩" };
    openSheetModal((labelMap[mode] || "處理待確認") + "（" + item.pendingId + "）", function (bodyEl, closeFn) {
      bodyEl.innerHTML =
        '<div class="form-group">' +
        '  <label class="form-label">目標顧客電話</label>' +
        '  <input class="form-input" id="inResPhone" type="tel" value="' + api.escapeHtml(item.formPhone || "") + '">' +
        "</div>" +
        (mode === "create_new"
          ? '<div class="form-group"><label class="form-label">飼主稱呼</label><input class="form-input" id="inResName" value="' + api.escapeHtml(item.formOwnerName || "") + '"></div>'
          : '<div class="form-group"><label class="form-label">指定既有寵物ID（選填，留空則依規則自動處理）</label><input class="form-input" id="inResPetId" placeholder="例如：P-0001"></div>') +
        '<button type="button" class="btn btn-primary btn-block" id="btnConfirmResolve">送出處理</button>';

      document.getElementById("btnConfirmResolve").addEventListener("click", async function () {
        const params = {
          pendingId: item.pendingId,
          resolution: mode,
          targetPhone: document.getElementById("inResPhone").value.trim()
        };
        const nameEl = document.getElementById("inResName");
        const petEl = document.getElementById("inResPetId");
        if (nameEl) params.newName = nameEl.value.trim();
        if (petEl && petEl.value.trim()) params.targetPetId = petEl.value.trim();

        const res = await api.apiPost("staff_pending_resolve", params, authCtx);
        if (!res || !res.ok) return api.showToast(api.errorText(res && res.error, res && res.message));
        api.showToast("處理完成：" + res.status);
        closeFn();
        await refreshPendingCount();
        loadPending();
      });
    });
  }

  function openSheetModal(title, renderBodyFn) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const sheet = document.createElement("div");
    sheet.className = "modal-sheet";
    const header = document.createElement("div");
    header.className = "modal-header";
    const h3 = document.createElement("h3");
    h3.className = "modal-title";
    h3.textContent = title;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn-outline btn-sm";
    closeBtn.textContent = "關閉";
    const closeFn = function () { backdrop.remove(); };
    closeBtn.addEventListener("click", closeFn);
    header.appendChild(h3);
    header.appendChild(closeBtn);
    const body = document.createElement("div");
    sheet.appendChild(header);
    sheet.appendChild(body);
    backdrop.appendChild(sheet);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeFn();
    });
    document.body.appendChild(backdrop);
    renderBodyFn(body, closeFn);
  }

  // ---------- 模擬客人選單（不切換身分） ----------
  function loadCustomerMenu() {
    subView = null;
    setNavActive("customer_menu");
    const pages = cfg.PAGES || {};
    const isMock = api.isMockMode();
    const linkSlots = isMock ? "../pet-slots/?mock=1" : (pages.SLOTS || "../pet-slots/");
    const linkForm = isMock ? "../pet-form/?mock=1" : (pages.FORM_LIFF || "../pet-form/");
    const linkRecords = isMock ? "../pet-records/?mock=1" : (pages.RECORDS_LIFF || "../pet-records/");
    const linkInfo = isMock ? "../../info/?mock=1" : (pages.INFO || "../../info/");

    const html = [];
    html.push(
      '<div class="notice-banner">' +
      '  <strong style="color:var(--primary-dark);">👀 模擬客人選單（不切換身分）</strong><br>' +
      "  可直接從這裡點開客人端的 4 個功能畫面檢查排版或實測填單，<strong>不會改動或切換您的管理者權限</strong>。" +
      "</div>"
    );

    html.push('<div class="card">');
    html.push('<h2 class="card-title">📱 客人看到的 4 格圖文選單</h2>');
    html.push('<div class="slots-grid" style="grid-template-columns:repeat(2,1fr);gap:10px;">');
    html.push(
      '<a class="btn btn-outline" style="flex-direction:column;min-height:84px;padding:12px;" href="' + api.escapeHtml(linkSlots) + '">' +
      '  <span style="font-size:22px;">📅</span>' +
      '  <span>查空檔</span>' +
      '  <span class="muted" style="font-size:11.5px;">看可預約時段</span>' +
      "</a>" +
      '<a class="btn btn-primary" style="flex-direction:column;min-height:84px;padding:12px;" href="' + api.escapeHtml(linkForm) + '">' +
      '  <span style="font-size:22px;">📝</span>' +
      '  <span>填顧客單</span>' +
      '  <span class="muted" style="font-size:11.5px;color:rgba(255,255,255,0.88);">新客／帶入舊資料</span>' +
      "</a>" +
      '<a class="btn btn-outline" style="flex-direction:column;min-height:84px;padding:12px;" href="' + api.escapeHtml(linkRecords) + '">' +
      '  <span style="font-size:22px;">📖</span>' +
      '  <span>我的紀錄</span>' +
      '  <span class="muted" style="font-size:11.5px;">看顧客單與收據</span>' +
      "</a>" +
      '<a class="btn btn-outline" style="flex-direction:column;min-height:84px;padding:12px;" href="' + api.escapeHtml(linkInfo) + '">' +
      '  <span style="font-size:22px;">📍</span>' +
      '  <span>聯絡店家</span>' +
      '  <span class="muted" style="font-size:11.5px;">地址・電話・須知</span>' +
      "</a>"
    );
    html.push("</div>");
    html.push("</div>");

    html.push('<div class="card">');
    html.push('<h2 class="card-title">🧪 測試「帶預約時間」開顧客單</h2>');
    html.push(
      '<p class="muted" style="margin:0 0 10px;">模擬發給客人的確認預約連結，預先帶入日期、時段與毛孩名字：</p>' +
      '<div class="form-group"><label class="form-label" for="simDate">日期</label><input class="form-input" id="simDate" type="date" value="' + api.escapeHtml(todayDate) + '"></div>' +
      '<div class="form-group"><label class="form-label" for="simTime">時段</label><input class="form-input" id="simTime" type="time" value="14:00"></div>' +
      '<div class="form-group"><label class="form-label" for="simPet">寵物名（選填）</label><input class="form-input" id="simPet" placeholder="例如：奶茶"></div>' +
      '<button type="button" class="btn btn-secondary btn-block" id="btnOpenSimForm">開啟預填顧客單測試</button>'
    );
    html.push("</div>");

    mainEl.innerHTML = html.join("");
    document.getElementById("btnOpenSimForm").addEventListener("click", function () {
      const d = document.getElementById("simDate").value || todayDate;
      const t = document.getElementById("simTime").value || "14:00";
      const p = document.getElementById("simPet").value.trim();
      const base = linkForm;
      const sep = base.indexOf("?") !== -1 ? "&" : "?";
      let url = base + sep + "date=" + encodeURIComponent(d) + "&time=" + encodeURIComponent(t);
      if (p) url += "&pet=" + encodeURIComponent(p);
      window.location.href = url;
    });
  }

  async function initPage() {
    renderLoading();
    authCtx = await api.initLiffAuth((cfg.LIFF_IDS && cfg.LIFF_IDS.STAFF) || "");
    if (!authCtx.ok) {
      if (!authCtx.redirecting) renderNotAdmin(authCtx.message);
      return;
    }

    if (navEl) {
      navEl.querySelectorAll("[data-tab]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const t = btn.getAttribute("data-tab");
          if (t === "today") loadToday();
          else if (t === "search") loadSearch();
          else if (t === "pending") loadPending();
          else if (t === "bookings") loadBookings();
          else if (t === "customer_menu") loadCustomerMenu();
        });
      });
    }

    const todayRes = await api.apiPost("staff_today", { date: todayDate }, authCtx);
    if (!todayRes || !todayRes.ok) {
      if (todayRes && todayRes.error === "not_admin") {
        renderNotAdmin(todayRes.message);
        return;
      }
      renderToday({ date: todayDate, calendarConfigured: false, events: [] });
    } else {
      renderToday(todayRes);
    }
    setNavActive("today");
    refreshPendingCount();
    refreshBookingCount();
  }

  initPage();
})();

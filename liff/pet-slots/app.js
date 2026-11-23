/**
 * 03｜時段查詢頁（免 LIFF 登入，直接讀 Apps Script doGet?action=slots）
 */
(function () {
  const cfg = window.PWC_CONFIG || {};
  const api = window.PwcApi;

  const mainEl = document.getElementById("slotsMain");
  const refreshBtn = document.getElementById("btnRefresh");
  const mockBadge = document.getElementById("mockBadge");
  const footerBtn = document.getElementById("btnFooterAsk");

  let slotsPayload = null;
  let selectedDate = "";

  if (api.isMockMode() && mockBadge) {
    mockBadge.classList.remove("hidden");
  }

  function renderLoading() {
    mainEl.innerHTML =
      '<div class="skeleton"></div>' +
      '<div class="skeleton" style="height: 68px;"></div>' +
      '<div class="skeleton" style="height: 220px;"></div>';
  }

  function renderError(msg) {
    mainEl.innerHTML =
      '<div class="card">' +
      '  <div class="state-emoji" style="text-align:center;">🐾</div>' +
      '  <p style="text-align:center;margin:0 0 12px;">' + api.escapeHtml(msg) + "</p>" +
      '  <div class="btn-row">' +
      '    <button type="button" class="btn btn-primary" id="btnRetrySlots">重新整理</button>' +
      '    <a class="btn btn-secondary" href="' + api.escapeHtml(api.buildOaMessageUrl(cfg.LINE_OA_ID, "您好，我想詢問寵物美容可預約時段🐾")) + '">用 LINE 詢問</a>' +
      "  </div>" +
      "</div>";
    const retry = document.getElementById("btnRetrySlots");
    if (retry) retry.addEventListener("click", loadSlots);
  }

  function pickDefaultDate(days) {
    if (!days || !days.length) return "";
    const firstAvail = days.find(function (d) { return d.hasAvailable; });
    return firstAvail ? firstAvail.date : days[0].date;
  }

  function render() {
    if (!slotsPayload || !slotsPayload.days) return;
    const days = slotsPayload.days;
    const oaId = slotsPayload.lineOaId || cfg.LINE_OA_ID || "@976fowuq";
    if (footerBtn) {
      footerBtn.href = api.buildOaMessageUrl(oaId, "您好，我想詢問寵物美容可預約的時段🐾");
    }

    if (!selectedDate || !days.some(function (d) { return d.date === selectedDate; })) {
      selectedDate = pickDefaultDate(days);
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
          const prefillMsg =
            "您好，我想詢問 " +
            activeDay.label +
            "（週" +
            activeDay.weekdayLabel +
            "）" +
            slot.time +
            " 的寵物美容時段🐾";
          const href = api.buildOaMessageUrl(oaId, prefillMsg);
          html.push(
            '<a class="slot-card slot-available" href="' + api.escapeHtml(href) + '">' +
            '  <span class="slot-time">' + api.escapeHtml(slot.time) + "</span>" +
            '  <span class="slot-badge">可約 ›</span>' +
            "</a>"
          );
        } else if (slot.status === "full") {
          html.push(
            '<div class="slot-card slot-full">' +
            '  <span class="slot-time">' + api.escapeHtml(slot.time) + "</span>" +
            '  <span class="slot-badge">已滿</span>' +
            "</div>"
          );
        } else {
          html.push(
            '<div class="slot-card slot-unavailable">' +
            '  <span class="slot-time">' + api.escapeHtml(slot.time) + "</span>" +
            '  <span class="slot-badge">不開放</span>' +
            "</div>"
          );
        }
      });
      html.push("</div>");
      html.push('<p class="field-hint" style="margin-top:10px;">點選「可約」時段，會自動幫您打開 LINE 並填好詢問日期與時間喔～</p>');
    }

    html.push("</div>");
    mainEl.innerHTML = html.join("");

    const strip = document.getElementById("dateStrip");
    if (strip) {
      strip.querySelectorAll("[data-date]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          selectedDate = btn.getAttribute("data-date");
          render();
        });
      });
    }
    const jumpBtn = document.getElementById("btnJumpAvail");
    if (jumpBtn) {
      jumpBtn.addEventListener("click", function () {
        selectedDate = jumpBtn.getAttribute("data-date");
        render();
      });
    }
  }

  async function loadSlots() {
    renderLoading();
    const res = await api.apiGetSlots();
    if (!res || !res.ok) {
      renderError((res && res.message) || "暫時無法取得空檔資料，請稍後再試");
      return;
    }
    slotsPayload = res;
    render();
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadSlots);
  }
  loadSlots();
})();

/**
 * 線上預約共用元件：預約摘要＋訂金匯款資訊＋回報末五碼表單
 * 查空檔頁（預約完成）與我的紀錄（我的預約）共用。
 */
(function () {
  const api = window.PwcApi;

  const STATUS_TEXT = {
    "待付訂金": { cls: "pill-amber", hint: "請在付款期限前匯款訂金，並回報帳號末五碼，逾期時段會自動釋出喔。" },
    "待確認收款": { cls: "pill-amber", hint: "已收到您的匯款回報，店家對帳確認後預約就成立囉！" },
    "待店家確認": { cls: "pill-amber", hint: "店家確認後就完成預約，請留意 LINE 訊息～" },
    "已確認": { cls: "pill-green", hint: "預約已成立，當天請提早 10 分鐘到店喔！" },
    "已取消（逾期未付）": { cls: "pill-red", hint: "超過付款期限，這個時段已自動釋出。若您已經匯款，請直接用 LINE 聯絡店家。" },
    "已取消": { cls: "pill-red", hint: "這筆預約已取消。" }
  };

  function statusPill(status) {
    const s = STATUS_TEXT[status] || { cls: "" };
    return '<span class="pill ' + s.cls + '">' + api.escapeHtml(status || "") + "</span>";
  }

  function dateLabel(iso) {
    const f = api.formatMmDdWeekday(iso);
    return f.label + (f.weekdayLabel ? "（週" + f.weekdayLabel + "）" : "");
  }

  function summaryRow(k, v) {
    return '<div class="summary-row"><span class="summary-k">' + api.escapeHtml(k) + '</span><span class="summary-v">' + v + "</span></div>";
  }

  /**
   * 在 container 畫出一筆預約卡片。
   * opts：{ booking, payment, authCtx, onChanged(newBooking) }
   */
  function render(container, opts) {
    const b = opts.booking || {};
    const pay = opts.payment || {};
    const info = STATUS_TEXT[b.status] || { hint: "" };
    const uid = "bp_" + String(b.recordId || "").replace(/[^A-Za-z0-9_-]/g, "");
    const html = [];

    html.push('<div class="card">');
    html.push(
      '<h2 class="card-title"><span>📅 ' + api.escapeHtml(dateLabel(b.date)) + " " + api.escapeHtml(b.time) + "</span>" + statusPill(b.status) + "</h2>"
    );
    html.push(summaryRow("毛孩", api.escapeHtml(b.petName || "")));
    html.push(summaryRow("服務", api.escapeHtml(b.service || "")));
    html.push(summaryRow("預約編號", api.escapeHtml(b.recordId || "")));
    if (b.deposit > 0 && (b.status === "待付訂金" || b.status === "待確認收款")) {
      html.push(summaryRow("訂金", "NT$ " + api.escapeHtml(String(b.deposit))));
      if (b.deadline) {
        html.push(summaryRow("付款期限", '<strong style="color:' + (b.overdue ? "var(--danger, #B91C1C)" : "inherit") + ';">' + api.escapeHtml(b.deadline) + "</strong>"));
      }
    }
    if (b.last5) {
      html.push(summaryRow("已回報末五碼", api.escapeHtml(b.last5) + (b.transferDate ? "（" + api.escapeHtml(b.transferDate) + "）" : "")));
    }
    if (info.hint) {
      html.push('<div class="notice-banner" style="margin-top:10px;">' + api.escapeHtml(info.hint) + "</div>");
    }

    if (b.canReport && b.deposit > 0) {
      if (pay.bankAccount) {
        html.push(
          '<div class="pref-box" style="margin-top:10px;">' +
          '  <div class="muted" style="margin-bottom:4px;">匯款帳號</div>' +
          '  <div style="font-weight:700;word-break:break-all;" id="' + uid + '_acct">' + api.escapeHtml(pay.bankAccount) + "</div>" +
          '  <button type="button" class="btn btn-outline btn-sm" style="margin-top:8px;" id="' + uid + '_copy">複製帳號</button>' +
          "</div>"
        );
      } else {
        html.push('<div class="notice-banner" style="margin-top:10px;">匯款帳號請用 LINE 向店家索取。</div>');
      }
      html.push(
        '<div style="margin-top:12px;">' +
        '  <div class="form-group">' +
        '    <label class="form-label" for="' + uid + '_last5">匯款帳號末五碼<span class="req-star">*</span></label>' +
        '    <input class="form-input" id="' + uid + '_last5" inputmode="numeric" maxlength="5" placeholder="例如 12345" value="' + api.escapeHtml(b.last5 || "") + '">' +
        "  </div>" +
        '  <div class="form-group">' +
        '    <label class="form-label" for="' + uid + '_date">匯款日期<span class="req-star">*</span></label>' +
        '    <input class="form-input" id="' + uid + '_date" type="date" value="' + api.escapeHtml(b.transferDate || api.todayIsoTaipei(0)) + '">' +
        "  </div>" +
        '  <button type="button" class="btn btn-primary btn-block" id="' + uid + '_send">' + (b.last5 ? "更正匯款資料" : "我已匯款，回報末五碼") + "</button>" +
        "</div>"
      );
    }
    html.push("</div>");
    container.innerHTML = html.join("");

    const copyBtn = document.getElementById(uid + "_copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        const text = pay.bankAccount || "";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { api.showToast("已複製匯款帳號"); }, function () { api.showToast(text); });
        } else {
          api.showToast(text);
        }
      });
    }

    const sendBtn = document.getElementById(uid + "_send");
    if (sendBtn) {
      sendBtn.addEventListener("click", async function () {
        const last5 = String(document.getElementById(uid + "_last5").value || "").trim();
        const transferDate = String(document.getElementById(uid + "_date").value || "").trim();
        if (!/^\d{5}$/.test(last5)) return api.showToast("請填寫 5 位數字的帳號末五碼");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return api.showToast("請選擇匯款日期");
        sendBtn.disabled = true;
        sendBtn.textContent = "送出中…";
        const res = await api.apiPost("report_payment", { recordId: b.recordId, last5: last5, transferDate: transferDate }, opts.authCtx);
        if (!res || !res.ok) {
          sendBtn.disabled = false;
          sendBtn.textContent = "我已匯款，回報末五碼";
          api.showToast(api.errorText(res && res.error, res && res.message));
          return;
        }
        api.showToast("已收到回報，店家確認後就完成預約囉！");
        const next = Object.assign({}, b, { status: res.status, last5: last5, transferDate: transferDate });
        if (typeof opts.onChanged === "function") {
          opts.onChanged(next);
        } else {
          render(container, Object.assign({}, opts, { booking: next }));
        }
      });
    }
  }

  window.PwcBookingPay = { render: render, statusPill: statusPill };
})();

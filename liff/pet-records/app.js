/**
 * 08｜我的紀錄 LIFF（客人本人看毛孩清單、歷次紀錄、私有顧客單／收據 PDF 與美容照片）
 */
(function () {
  const cfg = window.PWC_CONFIG || {};
  const api = window.PwcApi;
  const viewer = window.PwcViewer;

  const mainEl = document.getElementById("recordsMain");
  const mockBadge = document.getElementById("mockBadge");
  const subTitle = document.getElementById("recordsSubtitle");

  if (api.isMockMode() && mockBadge) {
    mockBadge.classList.remove("hidden");
  }

  let authCtx = null;

  function renderLoading() {
    if (subTitle) subTitle.textContent = "正在幫您翻找毛孩的美容紀錄…";
    mainEl.innerHTML =
      '<div class="skeleton"></div>' +
      '<div class="skeleton"></div>';
  }

  function renderNotBound() {
    if (subTitle) subTitle.textContent = "尚未連結毛孩資料";
    const formUrl = (cfg.PAGES && cfg.PAGES.FORM_LIFF) || "../pet-form/";
    mainEl.innerHTML =
      '<div class="fullscreen-state">' +
      '  <div class="state-emoji">🐾</div>' +
      '  <h2 style="margin:0 0 8px;font-size:19px;color:var(--primary-dark);">還沒有連上您的毛孩紀錄喔</h2>' +
      '  <p class="muted" style="margin:0 0 18px;max-width:320px;">嗨！只要先填寫一次「顧客單」，系統就會用您的電話把以前的紀錄、顧客單和收據全部帶出來～</p>' +
      '  <a class="btn btn-primary" href="' + api.escapeHtml(formUrl) + '">📝 去填寫顧客單</a>' +
      "</div>";
  }

  function renderError(msg, retryFn) {
    mainEl.innerHTML =
      '<div class="fullscreen-state">' +
      '  <div class="state-emoji">😿</div>' +
      '  <p class="muted" style="margin:0 0 16px;">' + api.escapeHtml(msg) + "</p>" +
      '  <button type="button" class="btn btn-primary" id="btnRecRetry">重新載入</button>' +
      "</div>";
    document.getElementById("btnRecRetry").addEventListener("click", retryFn || loadPetList);
  }

  function formatMmDd(iso) {
    const m = String(iso || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
    return m ? (m[1] + "/" + m[2]) : (iso || "");
  }

  function renderPetList(data) {
    const custName = (data.customer && data.customer.name) || "";
    const pets = data.pets || [];
    if (subTitle) {
      subTitle.textContent = custName ? (custName + " 您好，以下是毛孩的紀錄") : "毛孩歷次紀錄與單據";
    }

    if (pets.length === 0) {
      const formUrl = (cfg.PAGES && cfg.PAGES.FORM_LIFF) || "../pet-form/";
      mainEl.innerHTML =
        '<div class="fullscreen-state">' +
        '  <div class="state-emoji">🐶</div>' +
        '  <p class="muted" style="margin:0 0 16px;">目前還沒有看到毛孩資料耶，歡迎先填寫顧客單，讓美容師幫毛孩建檔喔！</p>' +
        '  <a class="btn btn-primary" href="' + api.escapeHtml(formUrl) + '">📝 去填寫顧客單</a>' +
        "</div>";
      return;
    }

    const html = [];
    pets.forEach(function (pet) {
      const emoji = pet.species === "貓" ? "🐱" : "🐶";
      const lastStr = pet.lastVisitDate
        ? (api.escapeHtml(pet.name) + " 最近一次來玩是 " + api.escapeHtml(formatMmDd(pet.lastVisitDate)) + " 喔")
        : "還沒來溫莎城堡玩過喔";
      html.push(
        '<div class="card" style="cursor:pointer;" data-open-pet="' + api.escapeHtml(pet.petId) + '">' +
        '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '    <strong style="font-size:18px;">' + emoji + " " + api.escapeHtml(pet.name) + "</strong>" +
        '    <span class="pill">' + api.escapeHtml(pet.species || "") + (pet.breed ? "・" + api.escapeHtml(pet.breed) : "") + "</span>" +
        "  </div>" +
        '  <div class="muted" style="margin-bottom:10px;">' + lastStr + "</div>" +
        '  <div style="display:flex;justify-content:space-between;align-items:center;">' +
        '    <span class="pill pill-green">累計來玩 ' + api.escapeHtml(pet.visitCount || 0) + " 次</span>" +
        '    <span style="color:var(--primary);font-weight:700;font-size:14px;">看紀錄 ›</span>' +
        "  </div>" +
        "</div>"
      );
    });

    mainEl.innerHTML = html.join("");
    mainEl.querySelectorAll("[data-open-pet]").forEach(function (card) {
      card.addEventListener("click", function () {
        loadPetTimeline(card.getAttribute("data-open-pet"));
      });
    });
  }

  function renderPetTimeline(data) {
    const pet = data.pet || {};
    const records = data.records || [];
    const emoji = pet.species === "貓" ? "🐱" : "🐶";
    if (subTitle) {
      subTitle.textContent = emoji + " " + (pet.name || "毛孩") + " 的美容紀錄（共 " + (pet.visitCount || 0) + " 次）";
    }

    const html = [];
    html.push(
      '<button type="button" class="btn btn-secondary btn-sm" id="btnBackPets" style="margin-bottom:12px;">← 返回毛孩清單</button>'
    );

    if (records.length === 0) {
      html.push(
        '<div class="card" style="text-align:center;padding:24px 12px;">' +
        "  <p class=\"muted\" style=\"margin:0;\">" + api.escapeHtml(pet.name) + " 目前還沒有完成的美容紀錄喔！下次來玩完就會出現在這裡～</p>" +
        "</div>"
      );
      mainEl.innerHTML = html.join("");
      document.getElementById("btnBackPets").addEventListener("click", loadPetList);
      return;
    }

    records.forEach(function (rec) {
      html.push('<div class="card">');
      html.push(
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '  <strong style="font-size:16px;">📅 ' + api.escapeHtml((rec.date || "").replace(/-/g, "/")) + (rec.time ? " " + api.escapeHtml(rec.time) : "") + "</strong>" +
        (rec.amount !== null && rec.amount !== undefined
          ? '<span class="pill pill-green">NT$ ' + Number(rec.amount).toLocaleString("en-US") + "</span>"
          : "") +
        "</div>"
      );
      html.push('<div style="margin-bottom:4px;"><strong>服務：</strong>' + api.escapeHtml(rec.service || "—") + "</div>");
      if (rec.groomingStyle) {
        html.push('<div style="margin-bottom:6px;"><strong>本次造型：</strong>' + api.escapeHtml(rec.groomingStyle) + "</div>");
      }

      if (rec.hasPhoto) {
        html.push(
          '<div style="margin-top:8px;">' +
          '  <button type="button" class="btn btn-secondary btn-block btn-sm" data-view-photo="' + api.escapeHtml(rec.recordId) + '">📷 查看本次美容照片</button>' +
          "</div>"
        );
      }

      html.push('<div class="btn-row" style="margin-top:10px;">');
      if (rec.customerSheetId) {
        html.push(
          '<button type="button" class="btn btn-outline btn-sm" data-doc-type="customer_sheet" data-doc-id="' + api.escapeHtml(rec.customerSheetId) + '">📄 顧客單</button>'
        );
      } else {
        html.push('<button type="button" class="btn btn-outline btn-sm" disabled>📄 還沒產生</button>');
      }
      if (rec.receiptNo) {
        html.push(
          '<button type="button" class="btn btn-primary btn-sm" data-doc-type="receipt" data-doc-id="' + api.escapeHtml(rec.receiptNo) + '">🧾 收據</button>'
        );
      } else {
        html.push('<button type="button" class="btn btn-outline btn-sm" disabled>🧾 還沒產生</button>');
      }
      html.push("</div>");
      html.push("</div>");
    });

    mainEl.innerHTML = html.join("");
    document.getElementById("btnBackPets").addEventListener("click", loadPetList);

    mainEl.querySelectorAll("[data-doc-id]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const type = btn.getAttribute("data-doc-type");
        const id = btn.getAttribute("data-doc-id");
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "開啟中…";
        const res = await api.apiPost("get_document", { type: type, id: id }, authCtx);
        btn.disabled = false;
        btn.textContent = oldText;

        if (!res || !res.ok) {
          api.showToast(api.errorText(res && res.error, res && res.message));
          return;
        }
        viewer.openPdfModal({
          title: type === "receipt" ? ("服務收據 " + id) : ("A4 顧客單 " + id),
          filename: res.filename || (id + ".pdf"),
          base64: res.base64
        });
      });
    });

    mainEl.querySelectorAll("[data-view-photo]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        const recId = btn.getAttribute("data-view-photo");
        const oldText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "載入照片中…";
        const res = await api.apiPost("get_document", { type: "photo", id: recId }, authCtx);
        btn.disabled = false;
        btn.textContent = oldText;

        if (!res || !res.ok) {
          api.showToast(api.errorText(res && res.error, res && res.message));
          return;
        }
        viewer.openPhotoModal({
          title: "美容紀錄照片",
          photos: res.photos || [],
          onLoadOriginal: function (idx) {
            return api.apiPost("get_document", { type: "photo", id: recId, index: idx }, authCtx);
          }
        });
      });
    });
  }

  async function loadPetList() {
    renderLoading();
    const res = await api.apiPost("my_records", {}, authCtx);
    if (!res || !res.ok) {
      if (res && res.error === "not_bound") renderNotBound();
      else renderError(api.errorText(res && res.error, res && res.message), loadPetList);
      return;
    }
    renderPetList(res);
  }

  async function loadPetTimeline(petId) {
    renderLoading();
    const res = await api.apiPost("my_records", { pet_id: petId }, authCtx);
    if (!res || !res.ok) {
      if (res && res.error === "not_bound") renderNotBound();
      else {
        api.showToast(api.errorText(res && res.error, res && res.message));
        loadPetList();
      }
      return;
    }
    renderPetTimeline(res);
  }

  async function initPage() {
    renderLoading();
    authCtx = await api.initLiffAuth((cfg.LIFF_IDS && cfg.LIFF_IDS.RECORDS) || "");
    if (!authCtx.ok) {
      if (!authCtx.redirecting) renderError(authCtx.message || "登入失敗", initPage);
      return;
    }
    loadPetList();
  }

  initPage();
})();

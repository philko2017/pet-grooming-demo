/**
 * 02｜顧客單 LIFF 填單（涵蓋溫莎城堡真實 Step 1 + Step 2 欄位、舊客自動帶入與防重送）
 */
(function () {
  const cfg = window.PWC_CONFIG || {};
  const api = window.PwcApi;
  const mainEl = document.getElementById("formMain");
  const mockBadge = document.getElementById("mockBadge");
  const stepSubtitle = document.getElementById("stepSubtitle");

  if (api.isMockMode() && mockBadge) {
    mockBadge.classList.remove("hidden");
  }

  const PERSONALITY_OPTIONS = [
    "親人", "親狗", "親貓", "容易緊張", "有攻擊性",
    "不會咬人", "會咬人", "不會咬貓狗", "會咬貓狗", "抗拒吹風機"
  ];
  const HEALTH_OPTIONS = [
    "狀況良好", "心臟病", "氣喘", "氣管塌陷", "癲癇",
    "心絲蟲", "手術外傷未癒合", "髖關節問題", "皮膚敏感／過敏",
    "傳染性疾病", "懷孕"
  ];
  const SERVICE_OPTIONS = [
    "基礎洗澡", "日常洗護", "全身造型大美容", "SPA 水療",
    "局部修剪", "剪指甲／清耳朵"
  ];
  const TIME_CHIPS = ["10:00", "11:00", "13:30", "14:30", "15:30", "16:30", "17:30"];

  let authCtx = null;
  let submitting = false;

  const state = {
    step: 1, // 1..5 或 "success"
    isNew: true,
    pets: [],
    selectedPetId: "",
    fromUrlDate: "",
    fromUrlTime: "",
    fromUrlPet: "",
    termsAccepted: false,
    requestId: "",
    lastResult: null,
    owner: {
      name: "",
      phone: "",
      realName: "",
      address: "",
      lineId: "",
      emergencyContact: "",
      photoConsent: "同意",
      referralSource: "",
      socialTag: "",
      note: ""
    },
    pet: {
      petId: "",
      name: "",
      species: "犬",
      breed: "",
      gender: "男生",
      neutered: "是",
      size: "小型",
      weight: "",
      age: "",
      microchip: "",
      personalityTags: [],
      personalityExtra: "",
      groomingExperience: "",
      healthTags: ["狀況良好"],
      healthExtra: "",
      visualCheck: "正常",
      emergencyMethod: "就近醫院",
      designatedHospital: ""
    },
    booking: {
      date: api.todayIsoTaipei(0),
      time: "14:00",
      serviceTags: [],
      serviceCustom: "",
      note: ""
    }
  };

  function newRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }

  function normalizePetSimple(s) {
    return String(s || "").replace(/\s+/g, "").toLowerCase();
  }

  function isValidTaiwanPhone(raw) {
    let cleaned = String(raw || "").replace(/[\s\-().]/g, "");
    if (cleaned.indexOf("+886") === 0) {
      cleaned = cleaned.replace(/^\+8860?/, "0");
    }
    if (!/^\d+$/.test(cleaned)) return false;
    if (/^09\d{8}$/.test(cleaned)) return true;
    return /^(037|049|089|02|03|04|05|06|07|08)\d+$/.test(cleaned) && (cleaned.length === 9 || cleaned.length === 10);
  }

  function splitTags(str, knownList) {
    const raw = String(str || "").split(/[,，、]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    const tags = [];
    const extras = [];
    raw.forEach(function (item) {
      if (knownList.indexOf(item) !== -1) tags.push(item);
      else extras.push(item);
    });
    return { tags: tags, extra: extras.join("、") };
  }

  function applyPetToState(p) {
    const pers = splitTags(p.personality, PERSONALITY_OPTIONS);
    const hlth = splitTags(p.healthNote, HEALTH_OPTIONS);
    state.selectedPetId = p.petId || "";
    state.pet = {
      petId: p.petId || "",
      name: p.name || "",
      species: p.species || "犬",
      breed: p.breed || "",
      gender: p.gender || "男生",
      neutered: p.neutered || "是",
      size: p.size || "小型",
      weight: p.weight === undefined || p.weight === null ? "" : String(p.weight),
      age: p.age || "",
      microchip: p.microchip || "",
      personalityTags: pers.tags,
      personalityExtra: pers.extra,
      groomingExperience: p.groomingExperience || "",
      healthTags: hlth.tags.length ? hlth.tags : (p.healthNote ? [] : ["狀況良好"]),
      healthExtra: hlth.extra,
      visualCheck: p.visualCheck || "正常",
      emergencyMethod: p.emergencyMethod || "就近醫院",
      designatedHospital: p.designatedHospital || ""
    };
  }

  function resetPetForAnother() {
    state.selectedPetId = "";
    state.termsAccepted = false;
    state.requestId = newRequestId();
    state.pet = {
      petId: "",
      name: "",
      species: "犬",
      breed: "",
      gender: "男生",
      neutered: "是",
      size: "小型",
      weight: "",
      age: "",
      microchip: "",
      personalityTags: [],
      personalityExtra: "",
      groomingExperience: "",
      healthTags: ["狀況良好"],
      healthExtra: "",
      visualCheck: "正常",
      emergencyMethod: "就近醫院",
      designatedHospital: ""
    };
    state.booking.serviceTags = [];
    state.booking.serviceCustom = "";
    state.booking.note = "";
  }

  function getComposedService() {
    const list = state.booking.serviceTags.slice();
    if (state.booking.serviceCustom.trim()) list.push(state.booking.serviceCustom.trim());
    return list.join("＋");
  }

  function getComposedPersonality() {
    const list = state.pet.personalityTags.slice();
    if (state.pet.personalityExtra.trim()) list.push(state.pet.personalityExtra.trim());
    return list.join(", ");
  }

  function getComposedHealth() {
    const list = state.pet.healthTags.slice();
    if (state.pet.healthExtra.trim()) list.push(state.pet.healthExtra.trim());
    return list.join(", ");
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function captureCurrentStepInputs() {
    if (state.step === 1) {
      state.owner.name = val("inOwnerName");
      state.owner.phone = val("inOwnerPhone");
      state.owner.realName = val("inRealName");
      state.owner.address = val("inAddress");
      state.owner.lineId = val("inLineId");
      state.owner.emergencyContact = val("inEmergencyContact");
      state.owner.note = val("inOwnerNote");
      state.owner.referralSource = val("inReferral");
      state.owner.socialTag = val("inSocialTag");
    } else if (state.step === 3) {
      state.pet.name = val("inPetName");
      state.pet.breed = val("inBreed");
      state.pet.weight = val("inWeight");
      state.pet.age = val("inAge");
      state.pet.microchip = val("inMicrochip");
    } else if (state.step === 4) {
      state.booking.date = val("inBookDate") || state.booking.date;
      state.booking.time = val("inBookTime") || state.booking.time;
      state.booking.serviceCustom = val("inServiceCustom");
      state.booking.note = val("inBookNote");
      state.pet.personalityExtra = val("inPersonalityExtra");
      state.pet.groomingExperience = val("inGroomExp");
      state.pet.healthExtra = val("inHealthExtra");
      state.pet.visualCheck = val("inVisualCheck");
      state.pet.designatedHospital = val("inHospital");
    }
  }

  function renderStepper(activeStep) {
    if (typeof activeStep !== "number") return "";
    const labels = ["家長資料", "選毛孩", "毛孩資料", "服務與健康", "核對送出"];
    if (stepSubtitle) {
      stepSubtitle.textContent = "步驟 " + activeStep + "／5：" + labels[activeStep - 1];
    }
    let bars = '<div class="stepper">';
    for (let i = 1; i <= 5; i++) {
      const cls = i < activeStep ? "step-bar done" : (i === activeStep ? "step-bar active" : "step-bar");
      bars += '<div class="' + cls + '"></div>';
    }
    bars += "</div>";
    return bars;
  }

  function renderLoading() {
    mainEl.innerHTML =
      '<div class="skeleton"></div>' +
      '<div class="skeleton" style="height: 220px;"></div>';
  }

  function renderFullError(msg) {
    mainEl.innerHTML =
      '<div class="fullscreen-state">' +
      '  <div class="state-emoji">🐶</div>' +
      '  <h2 style="margin:0 0 8px;font-size:18px;">無法開啟表單</h2>' +
      '  <p class="muted" style="margin:0 0 18px;">' + api.escapeHtml(msg) + "</p>" +
      '  <button type="button" class="btn btn-primary" id="btnFormReload">重新載入</button>' +
      "</div>";
    const r = document.getElementById("btnFormReload");
    if (r) r.addEventListener("click", initPage);
  }

  function renderStep() {
    if (state.step === "success") {
      renderSuccess();
      return;
    }

    const html = [];
    html.push(renderStepper(state.step));

    if (state.fromUrlDate && state.fromUrlTime && state.step !== 5) {
      html.push(
        '<div class="notice-banner" style="display:flex;justify-content:space-between;align-items:center;">' +
        "  <span>📅 本次預約：<strong>" + api.escapeHtml(state.booking.date) + " " + api.escapeHtml(state.booking.time) + "</strong></span>" +
        '  <span class="pill pill-green">已帶入時間</span>' +
        "</div>"
      );
    }

    if (state.step === 1) {
      if (!state.isNew) {
        html.push(
          '<div class="notice-banner">嗨，歡迎回來！我們已幫您帶入上次留的資料，沒有變動直接點「下一步」就可以囉～</div>'
        );
      } else {
        html.push(
          '<div class="notice-banner">歡迎來到溫莎城堡寵物沙龍！請幫我們確認家長聯絡方式，讓美容師更了解您與毛孩喔🐾</div>'
        );
      }

      html.push('<div class="card">');
      html.push('<h2 class="card-title">👤 Step 1｜家長（飼主）資料</h2>');
      html.push(
        '<div class="form-group">' +
        '  <label class="form-label" for="inOwnerName">希望怎麼稱呼您<span class="req-star">*</span></label>' +
        '  <input class="form-input" id="inOwnerName" placeholder="例如：布丁媽媽、陳小姐" value="' + api.escapeHtml(state.owner.name) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inOwnerPhone">聯絡電話<span class="req-star">*</span></label>' +
        '  <input class="form-input" id="inOwnerPhone" type="tel" inputmode="tel" placeholder="0912345678" value="' + api.escapeHtml(state.owner.phone) + '">' +
        '  <div class="field-hint">僅供急診聯繫與紀錄對應，不會公開顯示。</div>' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inRealName">家長／飼主真實姓名</label>' +
        '  <input class="form-input" id="inRealName" placeholder="印於顧客單契約確認（建議填寫）" value="' + api.escapeHtml(state.owner.realName) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inAddress">聯絡地址</label>' +
        '  <input class="form-input" id="inAddress" placeholder="請填寫聯絡地址" value="' + api.escapeHtml(state.owner.address) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inLineId">LINE ID（帳號）</label>' +
        '  <input class="form-input" id="inLineId" placeholder="方便我們搜尋聯繫的 LINE ID" value="' + api.escapeHtml(state.owner.lineId) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inEmergencyContact">緊急聯絡人／電話／與飼主關係</label>' +
        '  <input class="form-input" id="inEmergencyContact" placeholder="例如：林先生 / 0911-222-333 / 配偶" value="' + api.escapeHtml(state.owner.emergencyContact) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label">是否同意毛孩照片供城堡社群公開分享</label>' +
        '  <div class="chips-grid">' +
        '    <button type="button" class="chip ' + (state.owner.photoConsent === "同意" ? "selected" : "") + '" data-consent="同意">同意分享</button>' +
        '    <button type="button" class="chip ' + (state.owner.photoConsent === "不同意" ? "selected" : "") + '" data-consent="不同意">不同意（請勿公開）</button>' +
        "  </div>" +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inOwnerNote">給美容師的長期備註</label>' +
        '  <textarea class="form-textarea" id="inOwnerNote" placeholder="若有特別需要注意的溝通習慣可先註記">' + api.escapeHtml(state.owner.note) + "</textarea>" +
        "</div>" +
        '<details class="clean-details">' +
        '  <summary>行銷小問題（選填）</summary>' +
        '  <div class="form-group" style="margin-top:10px;">' +
        '    <label class="form-label" for="inReferral">透過哪裡認識溫莎城堡？</label>' +
        '    <input class="form-input" id="inReferral" placeholder="Google 地圖 / IG / 朋友介紹" value="' + api.escapeHtml(state.owner.referralSource) + '">' +
        "  </div>" +
        '  <div class="form-group" style="margin-bottom:0;">' +
        '    <label class="form-label" for="inSocialTag">樂意公開照片且歡迎標記的 IG／FB 帳號</label>' +
        '    <input class="form-input" id="inSocialTag" placeholder="@帳號名稱" value="' + api.escapeHtml(state.owner.socialTag) + '">' +
        "  </div>" +
        "</details>"
      );
      html.push("</div>");
      html.push(
        '<div class="sticky-footer"><div class="sticky-footer-inner">' +
        '  <button type="button" class="btn btn-primary btn-block" id="btnNext1">下一步</button>' +
        "</div></div>"
      );
    } else if (state.step === 2) {
      html.push('<div class="card">');
      html.push('<h2 class="card-title">🐾 Step 2｜選擇本次要美容的毛孩</h2>');
      html.push('<p class="muted" style="margin:0 0 12px;">點選毛孩卡片會自動帶入過去填過的資料，或幫另一隻新毛孩建檔。</p>');
      state.pets.forEach(function (p) {
        const active = state.selectedPetId === p.petId;
        html.push(
          '<div class="card" style="cursor:pointer;border-width:2px;border-color:' + (active ? "var(--primary)" : "var(--border)") + ';background:' + (active ? "#FFFDF9" : "#FFF") + ';" data-pick-pet="' + api.escapeHtml(p.petId) + '">' +
          '  <div style="display:flex;justify-content:space-between;align-items:center;">' +
          '    <strong style="font-size:17px;">' + (p.species === "貓" ? "🐱 " : "🐶 ") + api.escapeHtml(p.name) + "</strong>" +
          '    <span class="pill">' + api.escapeHtml(p.species || "") + (p.breed ? "・" + api.escapeHtml(p.breed) : "") + "</span>" +
          "  </div>" +
          '  <div class="muted" style="margin-top:4px;">' +
          (p.weight ? "體重 " + api.escapeHtml(p.weight) + " kg　" : "") +
          (p.age ? "年齡 " + api.escapeHtml(p.age) : "") +
          "  </div>" +
          "</div>"
        );
      });
      html.push(
        '<button type="button" class="btn btn-outline btn-block" id="btnNewPet">＋ 新增一隻毛孩</button>'
      );
      html.push("</div>");
      html.push(
        '<div class="sticky-footer"><div class="sticky-footer-inner">' +
        '  <button type="button" class="btn btn-secondary" id="btnBack2">上一步</button>' +
        '  <button type="button" class="btn btn-primary" style="flex:2;" id="btnNext2">下一步</button>' +
        "</div></div>"
      );
    } else if (state.step === 3) {
      html.push('<div class="card">');
      html.push('<h2 class="card-title">🐶 Step 3｜毛寶貝基本資料</h2>');
      html.push(
        '<div class="form-group">' +
        '  <label class="form-label" for="inPetName">毛寶貝名字／暱稱<span class="req-star">*</span></label>' +
        '  <input class="form-input" id="inPetName" placeholder="例如：奶茶、布丁" value="' + api.escapeHtml(state.pet.name) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label">預約對象<span class="req-star">*</span></label>' +
        '  <div class="chips-grid">' +
        '    <button type="button" class="chip ' + (state.pet.species === "犬" ? "selected" : "") + '" data-species="犬">🐶 狗狗（犬）</button>' +
        '    <button type="button" class="chip ' + (state.pet.species === "貓" ? "selected" : "") + '" data-species="貓">🐱 貓咪（貓）</button>' +
        "  </div>" +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inBreed">品種</label>' +
        '  <input class="form-input" id="inBreed" placeholder="例如：貴賓、柴犬、英短、米克斯" value="' + api.escapeHtml(state.pet.breed) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label">性別</label>' +
        '  <div class="chips-grid">' +
        ["男生", "女生", "不確定"].map(function (g) {
          return '<button type="button" class="chip ' + (state.pet.gender === g ? "selected" : "") + '" data-gender="' + g + '">' + g + "</button>";
        }).join("") +
        "  </div>" +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label">是否已完成絕育（結紮）</label>' +
        '  <div class="chips-grid">' +
        ["是", "否", "尚未"].map(function (n) {
          return '<button type="button" class="chip ' + (state.pet.neutered === n ? "selected" : "") + '" data-neutered="' + n + '">' + n + "</button>";
        }).join("") +
        "  </div>" +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label">體型</label>' +
        '  <div class="chips-grid">' +
        ["小型", "中型", "大型", "特大型"].map(function (sz) {
          return '<button type="button" class="chip ' + (state.pet.size === sz ? "selected" : "") + '" data-size="' + sz + '">' + sz + "</button>";
        }).join("") +
        "  </div>" +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inWeight">體重（公斤）</label>' +
        '  <input class="form-input" id="inWeight" type="number" step="0.1" inputmode="decimal" placeholder="例如：4.5" value="' + api.escapeHtml(state.pet.weight) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inAge">年齡／生日</label>' +
        '  <input class="form-input" id="inAge" placeholder="例如：3歲、2023/05" value="' + api.escapeHtml(state.pet.age) + '">' +
        "</div>" +
        '<div class="form-group" style="margin-bottom:0;">' +
        '  <label class="form-label" for="inMicrochip">晶片號碼</label>' +
        '  <input class="form-input" id="inMicrochip" placeholder="15 碼晶片號碼" value="' + api.escapeHtml(state.pet.microchip) + '">' +
        '  <div class="field-hint">已有晶片號碼者免填飼主身分證字號；資料僅保存於店家私有檔案。</div>' +
        "</div>"
      );
      html.push("</div>");
      html.push(
        '<div class="sticky-footer"><div class="sticky-footer-inner">' +
        '  <button type="button" class="btn btn-secondary" id="btnBack3">上一步</button>' +
        '  <button type="button" class="btn btn-primary" style="flex:2;" id="btnNext3">下一步</button>' +
        "</div></div>"
      );
    } else if (state.step === 4) {
      html.push('<div class="card">');
      html.push('<h2 class="card-title">✂️ Step 4-1｜本次預約時間與服務</h2>');
      html.push(
        '<div class="form-group">' +
        '  <label class="form-label" for="inBookDate">預約日期<span class="req-star">*</span></label>' +
        '  <input class="form-input" id="inBookDate" type="date" value="' + api.escapeHtml(state.booking.date) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inBookTime">預約時段<span class="req-star">*</span></label>' +
        '  <div class="chips-grid" style="margin-bottom:8px;">' +
        TIME_CHIPS.map(function (t) {
          return '<button type="button" class="chip chip-sm ' + (state.booking.time === t ? "selected" : "") + '" data-time="' + t + '">' + t + "</button>";
        }).join("") +
        "  </div>" +
        '  <input class="form-input" id="inBookTime" type="time" value="' + api.escapeHtml(state.booking.time) + '">' +
        "</div>" +
        '<div class="form-group" style="margin-bottom:0;">' +
        '  <label class="form-label">本次服務項目（可複選或自填）<span class="req-star">*</span></label>' +
        '  <div class="chips-grid" style="margin-bottom:8px;">' +
        SERVICE_OPTIONS.map(function (sv) {
          const sel = state.booking.serviceTags.indexOf(sv) !== -1;
          return '<button type="button" class="chip chip-sm ' + (sel ? "selected" : "") + '" data-service="' + api.escapeHtml(sv) + '">' + api.escapeHtml(sv) + "</button>";
        }).join("") +
        "  </div>" +
        '  <input class="form-input" id="inServiceCustom" placeholder="其他指定項目或加購（選填，如刷牙、去廢毛）" value="' + api.escapeHtml(state.booking.serviceCustom) + '">' +
        "</div>"
      );
      html.push("</div>");

      html.push('<div class="card">');
      html.push('<h2 class="card-title">🩺 Step 4-2｜個性與健康狀況告知</h2>');
      html.push('<div class="notice-banner">毛孩有沒有怕生、咬人、皮膚敏感、心臟或關節方面需要注意的地方呢？提前告訴我們，美容過程會更安心。</div>');
      html.push(
        '<div class="form-group">' +
        '  <label class="form-label">個性描述（可複選）</label>' +
        '  <div class="chips-grid" style="margin-bottom:8px;">' +
        PERSONALITY_OPTIONS.map(function (p) {
          const sel = state.pet.personalityTags.indexOf(p) !== -1;
          return '<button type="button" class="chip chip-sm ' + (sel ? "selected" : "") + '" data-pers="' + api.escapeHtml(p) + '">' + api.escapeHtml(p) + "</button>";
        }).join("") +
        "  </div>" +
        '  <input class="form-input" id="inPersonalityExtra" placeholder="其他個性補充（選填）" value="' + api.escapeHtml(state.pet.personalityExtra) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inGroomExp">過去洗澡外出美容經驗</label>' +
        '  <input class="form-input" id="inGroomExp" placeholder="例如：約一個月洗一次、曾對烘箱較緊張" value="' + api.escapeHtml(state.pet.groomingExperience) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label">病史與健康注意事項（可複選）</label>' +
        '  <div class="chips-grid" style="margin-bottom:8px;">' +
        HEALTH_OPTIONS.map(function (h) {
          const sel = state.pet.healthTags.indexOf(h) !== -1;
          return '<button type="button" class="chip chip-sm ' + (sel ? "selected" : "") + '" data-health="' + api.escapeHtml(h) + '">' + api.escapeHtml(h) + "</button>";
        }).join("") +
        "  </div>" +
        '  <input class="form-input" id="inHealthExtra" placeholder="其他病史、正在吃的藥或過敏原（選填）" value="' + api.escapeHtml(state.pet.healthExtra) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label" for="inVisualCheck">目前身體目視狀況</label>' +
        '  <input class="form-input" id="inVisualCheck" placeholder="例如：正常、耳朵微紅、毛髮有打結" value="' + api.escapeHtml(state.pet.visualCheck) + '">' +
        "</div>" +
        '<div class="form-group">' +
        '  <label class="form-label">如須緊急送醫，希望送往</label>' +
        '  <div class="chips-grid">' +
        ["就近醫院", "飼主聯絡地址", "指定醫院"].map(function (m) {
          return '<button type="button" class="chip chip-sm ' + (state.pet.emergencyMethod === m ? "selected" : "") + '" data-emerg="' + m + '">' + m + "</button>";
        }).join("") +
        "  </div>" +
        "</div>" +
        '<div class="form-group ' + (state.pet.emergencyMethod === "指定醫院" ? "" : "hidden") + '" id="hospitalGroup">' +
        '  <label class="form-label" for="inHospital">指定動物醫院名稱／地址／電話</label>' +
        '  <input class="form-input" id="inHospital" placeholder="例如：中和某某動物醫院 / 02-2222-1111" value="' + api.escapeHtml(state.pet.designatedHospital) + '">' +
        "</div>" +
        '<div class="form-group" style="margin-bottom:0;">' +
        '  <label class="form-label" for="inBookNote">本次造型需求／其他備註</label>' +
        '  <textarea class="form-textarea" id="inBookNote" placeholder="例如：頭剪圓一點、希望下午 5 點後通知接回">' + api.escapeHtml(state.booking.note) + "</textarea>" +
        "</div>"
      );
      html.push("</div>");
      html.push(
        '<div class="sticky-footer"><div class="sticky-footer-inner">' +
        '  <button type="button" class="btn btn-secondary" id="btnBack4">上一步</button>' +
        '  <button type="button" class="btn btn-primary" style="flex:2;" id="btnNext4">下一步：核對資料</button>' +
        "</div></div>"
      );
    } else if (state.step === 5) {
      const svc = getComposedService();
      const pers = getComposedPersonality();
      const hlth = getComposedHealth();
      html.push('<div class="notice-banner">最後再幫我們核對一次資料，確認沒問題就按下「確認送出顧客單」吧！</div>');
      html.push('<div class="card">');
      html.push('<h2 class="card-title">✅ Step 5｜填寫內容確認</h2>');
      html.push(summaryRow("飼主稱呼", state.owner.name));
      html.push(summaryRow("聯絡電話", state.owner.phone));
      if (state.owner.realName) html.push(summaryRow("真實姓名", state.owner.realName));
      html.push(summaryRow("毛寶貝", state.pet.name + "（" + state.pet.species + (state.pet.breed ? "・" + state.pet.breed : "") + "）"));
      html.push(summaryRow("預約時間", state.booking.date + " " + state.booking.time));
      html.push(summaryRow("服務項目", svc));
      html.push(summaryRow("個性／健康", [pers, hlth].filter(Boolean).join("｜") || "無特別補充"));
      html.push(summaryRow("緊急送醫", state.pet.emergencyMethod + (state.pet.emergencyMethod === "指定醫院" && state.pet.designatedHospital ? "（" + state.pet.designatedHospital + "）" : "")));
      html.push(summaryRow("照片分享", state.owner.photoConsent));
      html.push("</div>");

      html.push('<div class="card">');
      html.push(
        '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:14px;">' +
        '  <input type="checkbox" id="chkTerms" ' + (state.termsAccepted ? "checked" : "") + ' style="width:22px;height:22px;flex:0 0 22px;margin-top:2px;">' +
        "  <span><strong>我確認以上毛孩健康與飼主資料皆據實告知，並同意溫莎城堡寵物沙龍《寵物美容契約書》相關規範。</strong></span>" +
        "</label>" +
        '<details class="clean-details">' +
        "  <summary>查看寵物美容契約重點</summary>" +
        '  <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:var(--muted);">' +
        "    <li>完整《寵物美容契約書》皆於溫莎城堡店內公開張貼，到店時會請您確認親簽。</li>" +
        "    <li>若毛孩隱瞞心臟、氣管、咬人等病史或狀況導致意外，經法定程序判定店家無疏失，店家不負賠償責任。</li>" +
        "    <li>預約時間前 24 小時內臨時取消，依規定每小時酌收空檔等候費 NT$50；遲到逾 10 分鐘得取消預約；完成通知接回後逾時 30 分鐘起另計照護逾時費。</li>" +
        "  </ul>" +
        "</details>"
      );
      html.push("</div>");

      html.push(
        '<div class="sticky-footer"><div class="sticky-footer-inner">' +
        '  <button type="button" class="btn btn-secondary" id="btnBack5">返回修改</button>' +
        '  <button type="button" class="btn btn-green" style="flex:2;" id="btnSubmitForm" ' + (state.termsAccepted ? "" : "disabled") + ">" + (submitting ? "送出中，請稍候…" : "確認送出顧客單") + "</button>" +
        "</div></div>"
      );
    }

    mainEl.innerHTML = html.join("");
    bindStepEvents();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function summaryRow(k, v) {
    return (
      '<div class="summary-row">' +
      '  <span class="summary-k">' + api.escapeHtml(k) + "</span>" +
      '  <span class="summary-v">' + api.escapeHtml(v || "—") + "</span>" +
      "</div>"
    );
  }

  function bindStepEvents() {
    if (state.step === 1) {
      mainEl.querySelectorAll("[data-consent]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          captureCurrentStepInputs();
          state.owner.photoConsent = btn.getAttribute("data-consent");
          renderStep();
        });
      });
      document.getElementById("btnNext1").addEventListener("click", function () {
        captureCurrentStepInputs();
        if (!state.owner.name) return api.showToast("請填寫您的稱呼喔！");
        if (!isValidTaiwanPhone(state.owner.phone)) return api.showToast("請填寫正確的台灣手機或市話號碼");
        state.step = !state.isNew && state.pets.length > 0 ? 2 : 3;
        renderStep();
      });
    } else if (state.step === 2) {
      mainEl.querySelectorAll("[data-pick-pet]").forEach(function (card) {
        card.addEventListener("click", function () {
          const id = card.getAttribute("data-pick-pet");
          const found = state.pets.find(function (p) { return p.petId === id; });
          if (found) applyPetToState(found);
          state.step = 3;
          renderStep();
        });
      });
      document.getElementById("btnNewPet").addEventListener("click", function () {
        resetPetForAnother();
        state.step = 3;
        renderStep();
      });
      document.getElementById("btnBack2").addEventListener("click", function () {
        state.step = 1;
        renderStep();
      });
      document.getElementById("btnNext2").addEventListener("click", function () {
        if (!state.selectedPetId && state.pets.length > 0) {
          applyPetToState(state.pets[0]);
        }
        state.step = 3;
        renderStep();
      });
    } else if (state.step === 3) {
      const bindSingle = function (attr, key) {
        mainEl.querySelectorAll("[" + attr + "]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            captureCurrentStepInputs();
            state.pet[key] = btn.getAttribute(attr);
            renderStep();
          });
        });
      };
      bindSingle("data-species", "species");
      bindSingle("data-gender", "gender");
      bindSingle("data-neutered", "neutered");
      bindSingle("data-size", "size");

      document.getElementById("btnBack3").addEventListener("click", function () {
        captureCurrentStepInputs();
        state.step = !state.isNew && state.pets.length > 0 ? 2 : 1;
        renderStep();
      });
      document.getElementById("btnNext3").addEventListener("click", function () {
        captureCurrentStepInputs();
        if (!state.pet.name) return api.showToast("請填寫毛寶貝的名字喔！");
        if (!state.pet.species) return api.showToast("請選擇狗狗或貓咪");
        state.step = 4;
        renderStep();
      });
    } else if (state.step === 4) {
      mainEl.querySelectorAll("[data-time]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          captureCurrentStepInputs();
          state.booking.time = btn.getAttribute("data-time");
          renderStep();
        });
      });
      mainEl.querySelectorAll("[data-service]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          captureCurrentStepInputs();
          const sv = btn.getAttribute("data-service");
          const idx = state.booking.serviceTags.indexOf(sv);
          if (idx === -1) state.booking.serviceTags.push(sv);
          else state.booking.serviceTags.splice(idx, 1);
          renderStep();
        });
      });
      mainEl.querySelectorAll("[data-pers]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          captureCurrentStepInputs();
          const val = btn.getAttribute("data-pers");
          const idx = state.pet.personalityTags.indexOf(val);
          if (idx === -1) state.pet.personalityTags.push(val);
          else state.pet.personalityTags.splice(idx, 1);
          renderStep();
        });
      });
      mainEl.querySelectorAll("[data-health]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          captureCurrentStepInputs();
          const val = btn.getAttribute("data-health");
          if (val === "狀況良好") {
            state.pet.healthTags = state.pet.healthTags.indexOf("狀況良好") !== -1 ? [] : ["狀況良好"];
          } else {
            state.pet.healthTags = state.pet.healthTags.filter(function (x) { return x !== "狀況良好"; });
            const idx = state.pet.healthTags.indexOf(val);
            if (idx === -1) state.pet.healthTags.push(val);
            else state.pet.healthTags.splice(idx, 1);
          }
          renderStep();
        });
      });
      mainEl.querySelectorAll("[data-emerg]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          captureCurrentStepInputs();
          state.pet.emergencyMethod = btn.getAttribute("data-emerg");
          renderStep();
        });
      });

      document.getElementById("btnBack4").addEventListener("click", function () {
        captureCurrentStepInputs();
        state.step = 3;
        renderStep();
      });
      document.getElementById("btnNext4").addEventListener("click", function () {
        captureCurrentStepInputs();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(state.booking.date)) return api.showToast("請選擇正確的預約日期");
        if (!state.booking.time) return api.showToast("請選擇或填寫預約時段");
        if (!getComposedService()) return api.showToast("請選擇或填寫本次服務項目");
        state.step = 5;
        renderStep();
      });
    } else if (state.step === 5) {
      const chk = document.getElementById("chkTerms");
      const subBtn = document.getElementById("btnSubmitForm");
      chk.addEventListener("change", function () {
        state.termsAccepted = chk.checked;
        subBtn.disabled = !chk.checked || submitting;
      });
      document.getElementById("btnBack5").addEventListener("click", function () {
        if (submitting) return;
        state.step = 4;
        renderStep();
      });
      subBtn.addEventListener("click", submitFormNow);
    }
  }

  async function submitFormNow() {
    if (submitting || !state.termsAccepted) return;
    submitting = true;
    const subBtn = document.getElementById("btnSubmitForm");
    if (subBtn) {
      subBtn.disabled = true;
      subBtn.textContent = "送出中，請稍候…";
    }

    if (!state.requestId) state.requestId = newRequestId();

    const payload = {
      requestId: state.requestId,
      owner: {
        name: state.owner.name,
        phone: state.owner.phone,
        realName: state.owner.realName,
        address: state.owner.address,
        lineId: state.owner.lineId,
        emergencyContact: state.owner.emergencyContact,
        photoConsent: state.owner.photoConsent,
        referralSource: state.owner.referralSource,
        socialTag: state.owner.socialTag,
        note: state.owner.note
      },
      pet: {
        petId: state.selectedPetId || "",
        name: state.pet.name,
        species: state.pet.species,
        breed: state.pet.breed,
        size: state.pet.size,
        weight: state.pet.weight,
        age: state.pet.age,
        gender: state.pet.gender,
        neutered: state.pet.neutered,
        microchip: state.pet.microchip,
        personality: getComposedPersonality(),
        groomingExperience: state.pet.groomingExperience,
        healthNote: getComposedHealth(),
        visualCheck: state.pet.visualCheck,
        emergencyMethod: state.pet.emergencyMethod,
        designatedHospital: state.pet.emergencyMethod === "指定醫院" ? state.pet.designatedHospital : ""
      },
      booking: {
        service: getComposedService(),
        date: state.booking.date,
        time: state.booking.time,
        note: state.booking.note
      }
    };

    const res = await api.apiPost("submit_form", payload, authCtx);
    submitting = false;

    if (!res || !res.ok) {
      api.showToast(api.errorText(res && res.error, res && res.message));
      if (subBtn) {
        subBtn.disabled = !state.termsAccepted;
        subBtn.textContent = "確認送出顧客單";
      }
      return;
    }

    state.lastResult = res;
    state.step = "success";
    renderStep();
  }

  function renderSuccess() {
    if (stepSubtitle) stepSubtitle.textContent = "填寫完成！謝謝您";
    const r = state.lastResult || {};
    const html = [];
    html.push('<div class="card" style="text-align:center;padding:24px 16px;">');
    html.push('  <div class="state-emoji">🎉</div>');
    html.push('  <h2 style="margin:0 0 8px;color:var(--primary-dark);">填寫完成！謝謝您</h2>');
    html.push(
      '  <p style="margin:0 0 12px;">我們已經收到 <strong>' +
      api.escapeHtml(state.pet.name) +
      "</strong> 的資料囉！<br>預約時間：<strong>" +
      api.escapeHtml(state.booking.date) +
      " " +
      api.escapeHtml(state.booking.time) +
      "</strong></p>"
    );
    if (r.customerSheetId) {
      html.push('<div class="pill pill-green" style="margin-bottom:10px;">顧客單號：' + api.escapeHtml(r.customerSheetId) + "</div>");
    }
    if (r.pdfGenerated === false) {
      html.push('<div class="notice-banner" style="text-align:left;">資料已儲存！顧客單 PDF 正在補產中，到店後店家會幫您處理喔。</div>');
    }
    if (r.pendingBind) {
      html.push('<div class="notice-banner" style="text-align:left;">因核對既有電話資料中，店員確認後就會幫您把過去的紀錄連起來喔～</div>');
    }
    html.push('<p class="muted" style="margin:8px 0 18px;">溫莎城堡寵物沙龍期待與您和 ' + api.escapeHtml(state.pet.name) + " 見面，到店時再麻煩於櫃檯簽名確認即可。</p>");
    html.push(
      '  <div class="btn-row" style="flex-direction:column;">' +
      '    <button type="button" class="btn btn-primary" id="btnCloseLiff">關閉視窗</button>' +
      '    <button type="button" class="btn btn-outline" id="btnAnotherPet">＋ 為另一隻毛孩填單</button>' +
      "  </div>"
    );
    html.push("</div>");
    mainEl.innerHTML = html.join("");

    document.getElementById("btnCloseLiff").addEventListener("click", function () {
      if (window.liff && typeof window.liff.isInClient === "function" && window.liff.isInClient()) {
        window.liff.closeWindow();
      } else {
        api.showToast("已完成，可以關閉這個視窗囉！");
      }
    });

    document.getElementById("btnAnotherPet").addEventListener("click", async function () {
      resetPetForAnother();
      renderLoading();
      const prof = await api.apiPost("load_profile", {}, authCtx);
      if (prof && prof.ok && !prof.isNew) {
        state.isNew = false;
        state.pets = prof.pets || [];
        state.step = state.pets.length > 0 ? 2 : 3;
      } else {
        state.step = 3;
      }
      renderStep();
    });
  }

  async function initPage() {
    renderLoading();
    authCtx = await api.initLiffAuth((cfg.LIFF_IDS && cfg.LIFF_IDS.FORM) || "");
    if (!authCtx.ok) {
      if (!authCtx.redirecting) renderFullError(authCtx.message || "無法登入 LINE");
      return;
    }

    // 重要規範：務必在 liff.init() 完成之後再讀取 location.search 網址參數
    const qDate = api.getParam("date");
    const qTime = api.getParam("time");
    const qPet = api.getParam("pet");
    if (/^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
      state.fromUrlDate = qDate;
      state.booking.date = qDate;
    }
    if (qTime) {
      state.fromUrlTime = qTime;
      state.booking.time = qTime;
    }
    if (qPet) state.fromUrlPet = qPet;

    state.requestId = newRequestId();
    const prof = await api.apiPost("load_profile", {}, authCtx);
    if (!prof || !prof.ok) {
      renderFullError(api.errorText(prof && prof.error, prof && prof.message));
      return;
    }

    if (!prof.isNew && prof.owner) {
      state.isNew = false;
      state.owner = Object.assign({}, state.owner, {
        name: prof.owner.name || "",
        phone: prof.owner.phone || "",
        realName: prof.owner.realName || "",
        address: prof.owner.address || "",
        lineId: prof.owner.lineId || "",
        emergencyContact: prof.owner.emergencyContact || "",
        photoConsent: prof.owner.photoConsent || "同意",
        referralSource: prof.owner.referralSource || "",
        socialTag: prof.owner.socialTag || "",
        note: prof.owner.note || ""
      });
      state.pets = prof.pets || [];
      if (state.fromUrlPet && state.pets.length > 0) {
        const targetNorm = normalizePetSimple(state.fromUrlPet);
        const hit = state.pets.find(function (p) { return normalizePetSimple(p.name) === targetNorm; });
        if (hit) applyPetToState(hit);
      }
    }

    state.step = 1;
    renderStep();
  }

  initPage();
})();

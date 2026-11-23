(function () {
  const cfg = window.PWC_CONFIG || {};
  const btnChat = document.getElementById("btnChatLine");
  const btnForm = document.getElementById("btnToForm");
  const staffLink = document.getElementById("staffEntryLink");
  if (btnChat && window.PwcApi) {
    btnChat.href = window.PwcApi.buildOaMessageUrl(cfg.LINE_OA_ID, "您好，我想詢問寵物美容相關問題🐾");
  }
  if (btnForm && cfg.PAGES && cfg.PAGES.FORM_LIFF) {
    btnForm.href = cfg.PAGES.FORM_LIFF;
  }
  if (staffLink && cfg.PAGES && cfg.PAGES.STAFF_LIFF) {
    staffLink.href = cfg.PAGES.STAFF_LIFF;
  }
})();

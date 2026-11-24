/**
 * 溫莎城堡寵物沙龍（測試期：17寵物美容 @976fowuq）前端共用設定檔
 * 日後切換至正式環境時，僅需替換此檔的 LINE_OA_ID、API_URL 與 LIFF_IDS 即可。
 */
window.PWC_CONFIG = {
  SHOP_NAME: "溫莎城堡寵物沙龍",
  SHOP_SUB: "Pets' Windsor Castle",
  LINE_OA_ID: "@976fowuq",

  // Google Apps Script Web App 網址（步驟 4 部署後填入）
  API_URL: "https://script.google.com/macros/s/AKfycbw7Tnlwr_ryLIY8fL8j0jtDLgAoHy2uJ20PUWQCtqx1eA9YhBUM7z3fH4ZuUehp-lQ/exec",

  LIFF_IDS: {
    FORM: "2012766085-snrHWolN",
    RECORDS: "2012766085-NLzSCnBq",
    STAFF: "2012766085-eJj990Rh",
    SLOTS: "2012766085-TC2EpM5n",
    INFO: "2012766085-muRR0RuW"
  },

  PAGES: {
    SLOTS: "https://liff.line.me/2012766085-TC2EpM5n",
    FORM_LIFF: "https://liff.line.me/2012766085-snrHWolN",
    RECORDS_LIFF: "https://liff.line.me/2012766085-NLzSCnBq",
    STAFF_LIFF: "https://liff.line.me/2012766085-eJj990Rh",
    INFO: "https://liff.line.me/2012766085-muRR0RuW"
  },

  SHOP_INFO: {
    address: "新北市中和區連城路347巷4弄6號2樓",
    addressNote: "老公寓白色露台小屋，電鈴在二樓",
    phone: "02-2222-2830",
    mapUrl: "https://maps.google.com/?q=新北市中和區連城路347巷4弄6號2樓",
    hours: "週二～週日 10:00–19:00（週一公休）",
    groomers: [
      "沙沙（店長暨犬貓美容師）",
      "史丹利（資深狗狗美容師）"
    ],
    officialLine: "@pwc_salon"
  }
};

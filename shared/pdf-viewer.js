/**
 * 溫莎城堡寵物沙龍｜雙平台 PDF 預覽與照片燈箱元件
 * 支援 iPhone LINE 內建瀏覽器（Blob URL）與 Android LINE 內建瀏覽器（PDF.js Canvas 直接繪製＋下載按鈕）。
 */
(function () {
  let pdfJsPromise = null;
  let activeBlobUrl = null;

  function base64ToUint8Array(b64) {
    const clean = String(b64 || "").replace(/[\r\n\s]/g, "");
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  function loadPdfJs() {
    if (window.pdfjsLib) {
      return Promise.resolve(window.pdfjsLib);
    }
    if (pdfJsPromise) {
      return pdfJsPromise;
    }
    pdfJsPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
      script.onload = function () {
        if (window.pdfjsLib) {
          resolve(window.pdfjsLib);
        } else {
          reject(new Error("pdfjsLib unavailable"));
        }
      };
      script.onerror = function () {
        reject(new Error("Failed to load pdf.js"));
      };
      document.head.appendChild(script);
    });
    return pdfJsPromise;
  }

  function closeModal(backdrop) {
    if (activeBlobUrl) {
      try {
        URL.revokeObjectURL(activeBlobUrl);
      } catch (ignore) {}
      activeBlobUrl = null;
    }
    if (backdrop && backdrop.parentNode) {
      backdrop.remove();
    }
  }

  async function openPdfModal(options) {
    const title = options.title || "查看單據";
    const filename = options.filename || "document.pdf";
    const base64 = options.base64 || "";

    const bytes = base64ToUint8Array(base64);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    activeBlobUrl = blobUrl;

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
    closeBtn.addEventListener("click", function () { closeModal(backdrop); });
    header.appendChild(h3);
    header.appendChild(closeBtn);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "pdf-canvas-wrap";
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "muted";
    loadingMsg.style.padding = "24px 8px";
    loadingMsg.textContent = "正在幫您把單據畫面排好，請稍候…";
    canvasWrap.appendChild(loadingMsg);

    const actions = document.createElement("div");
    actions.className = "btn-row";

    const downloadLink = document.createElement("a");
    downloadLink.className = "btn btn-primary";
    downloadLink.textContent = "⬇ 下載 PDF";
    downloadLink.href = blobUrl;
    downloadLink.download = filename;

    const openLink = document.createElement("a");
    openLink.className = "btn btn-secondary";
    openLink.textContent = "另開檢視";
    openLink.href = blobUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener";

    actions.appendChild(downloadLink);
    actions.appendChild(openLink);

    sheet.appendChild(header);
    sheet.appendChild(canvasWrap);
    sheet.appendChild(actions);
    backdrop.appendChild(sheet);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal(backdrop);
    });
    document.body.appendChild(backdrop);

    try {
      const pdfjs = await loadPdfJs();
      // 關閉 Web Worker 以避開跨網域與 LINE WebView worker 限制
      const task = pdfjs.getDocument({ data: bytes, disableWorker: true });
      const pdf = await task.promise;
      canvasWrap.innerHTML = "";
      const targetWidth = Math.max(300, Math.min(480, canvasWrap.clientWidth - 20));
      const dpr = Math.min(window.devicePixelRatio || 1.5, 2.2);

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = (targetWidth / vp1.width) * dpr;
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        canvasWrap.appendChild(canvas);
      }
    } catch (err) {
      canvasWrap.innerHTML = "";
      const fallbackNote = document.createElement("div");
      fallbackNote.className = "muted";
      fallbackNote.style.padding = "20px 10px";
      fallbackNote.textContent = "目前瀏覽器無法直接預覽畫面，請點下方「下載 PDF」或「另開檢視」查看喔！";
      canvasWrap.appendChild(fallbackNote);
    }
  }

  function openPhotoModal(options) {
    const title = options.title || "美容照片";
    const photos = options.photos || [];
    const onLoadOriginal = options.onLoadOriginal;

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
    closeBtn.addEventListener("click", function () { backdrop.remove(); });
    header.appendChild(h3);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gridTemplateColumns = "repeat(2, 1fr)";
    body.style.gap = "8px";
    body.style.maxHeight = "68vh";
    body.style.overflowY = "auto";

    photos.forEach(function (ph) {
      const wrap = document.createElement("div");
      wrap.style.background = "#FAF6F1";
      wrap.style.borderRadius = "10px";
      wrap.style.overflow = "hidden";
      wrap.style.border = "1px solid #E6DDD3";

      const img = document.createElement("img");
      img.src = "data:" + (ph.mime || "image/jpeg") + ";base64," + ph.base64;
      img.alt = ph.filename || "寵物照片";
      img.style.width = "100%";
      img.style.display = "block";
      img.style.aspectRatio = "1 / 1";
      img.style.objectFit = "cover";
      img.style.cursor = "pointer";

      img.addEventListener("click", async function () {
        if (typeof onLoadOriginal === "function") {
          window.PwcApi.showToast("正在讀取清晰圖片…", 1800);
          const full = await onLoadOriginal(ph.index);
          if (full && full.ok && full.base64) {
            img.src = "data:" + (full.mime || "image/jpeg") + ";base64," + full.base64;
          }
        }
      });

      wrap.appendChild(img);
      body.appendChild(wrap);
    });

    sheet.appendChild(header);
    sheet.appendChild(body);
    backdrop.appendChild(sheet);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) backdrop.remove();
    });
    document.body.appendChild(backdrop);
  }

  window.PwcViewer = {
    openPdfModal: openPdfModal,
    openPhotoModal: openPhotoModal
  };
})();

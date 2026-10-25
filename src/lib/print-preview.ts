// One preview/export path for bills, accounts, ledgers and labels. No shop writes.
export function previewDocument(title: string, html: string) {
  document.getElementById("print-preview")?.remove();
  const wrapper = document.createElement("div");
  wrapper.id = "print-preview";
  wrapper.setAttribute("role", "dialog");
  wrapper.setAttribute("aria-modal", "true");
  wrapper.setAttribute("aria-label", `${title} print preview`);
  wrapper.style.cssText = "position:fixed;inset:0;z-index:9999;background:var(--background,#fff);color:var(--foreground,#111);display:flex;flex-direction:column";
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--border,#ddd)";
  const heading = document.createElement("strong");
  heading.textContent = title;
  heading.style.cssText = "margin-right:auto;overflow-wrap:anywhere";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.style.cssText = "width:100%;font-size:13px";
  status.textContent = "Preparing PDF…";
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.style.cssText = "flex:1;min-height:0;width:100%;border:0;background:white";
  const fileName = (title.replace(/[^\p{L}\p{N}\- ]+/gu, "").trim().replace(/\s+/g, "-") || "document") + ".pdf";
  let file: File | undefined;
  let preparing: Promise<void> | undefined;
  const previousFocus = document.activeElement;
  const close = () => { wrapper.remove(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  wrapper.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  const button = (label: string, action: () => void) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label;
    b.style.cssText = "border:1px solid var(--border,#ddd);border-radius:6px;padding:10px 12px;background:var(--card,#fff);color:var(--foreground,#111);cursor:pointer";
    b.onclick = action; return b;
  };
  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = fileName; link.rel = "noopener";
    wrapper.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = "PDF download requested. Check your downloads.";
  };
  const share = button("Share PDF", () => {
    if (!file) return;
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      download(); status.textContent = "File sharing is unavailable here. PDF download requested."; return;
    }
    // File is prepared BEFORE the click: preserve transient activation on phones.
    void navigator.share({ files: [file], title }).catch((error: unknown) => {
      if ((error as Error)?.name === "AbortError") return;
      download(); status.textContent = "Sharing failed. PDF download requested instead.";
    });
  });
  const save = button("Download PDF", download);
  const print = button("Print", () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); });
  const prepare = async () => {
    share.disabled = save.disabled = true;
    status.textContent = "Preparing PDF…";
    try {
      const doc = frame.contentDocument;
      if (!doc?.body) throw new Error("Preview not ready");
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      await doc.fonts.ready;
      await Promise.all(Array.from(doc.images, (img) => img.decode().catch(() => undefined)));
      const labels = Array.from(doc.querySelectorAll<HTMLElement>(".roll .label"));
      const node = labels[0] ?? doc.querySelector<HTMLElement>(".thermal") ?? doc.body;
      const width = Math.max(node.scrollWidth, node.getBoundingClientRect().width, 1);
      const height = Math.max(node.scrollHeight, node === doc.body ? doc.documentElement.scrollHeight : node.offsetHeight, 200);
      const thermal = !!doc.querySelector(".thermal, .roll");
      const pageHeight = labels.length ? node.getBoundingClientRect().height : thermal ? Math.min(1122, height) : Math.floor(width * 297 / 210);
      const pdf = thermal
        ? new jsPDF({ orientation: width > pageHeight ? "landscape" : "portrait", unit: "px", format: [width, pageHeight], hotfixes: ["px_scaling"] })
        : new jsPDF({ unit: "mm", format: "a4" });
      // Render bounded page tiles; never allocate one enormous mobile canvas.
      const scale = Math.min(2, Math.sqrt(4_000_000 / (width * pageHeight)));
      const tiles = labels.map(label => ({ node: label, y: 0, height: label.getBoundingClientRect().height }));
      if (!labels.length) {
        const origin = node === doc.body ? 0 : node.getBoundingClientRect().top;
        const rows = Array.from(node.querySelectorAll("tr"), row => {
          const r = row.getBoundingClientRect(); return { top: r.top - origin, bottom: r.bottom - origin };
        });
        for (let y = 0; y < height;) {
          let end = Math.min(y + pageHeight, height);
          const split = rows.find(row => row.top > y + 1 && row.top < end && row.bottom > end);
          if (split) end = split.top; // Keep ordinary table rows on a single page.
          tiles.push({ node, y, height: end - y }); y = end;
        }
      }
      for (const [index, tile] of tiles.entries()) {
        if (!wrapper.isConnected) return;
        const tileHeight = tile.height;
        const canvas = await html2canvas(tile.node, { scale, backgroundColor: "#ffffff", useCORS: true,
          width, height: tileHeight, x: 0, y: tile.y, scrollX: 0, scrollY: 0, windowWidth: width, logging: false });
        if (index) pdf.addPage();
        const pw = pdf.internal.pageSize.getWidth();
        pdf.addImage(canvas.toDataURL("image/jpeg", .95), "JPEG", 0, 0, pw, tileHeight * pw / width);
        canvas.width = canvas.height = 0;
      }
      file = new File([pdf.output("blob")], fileName, { type: "application/pdf" });
      share.disabled = save.disabled = false;
      status.textContent = "PDF ready. Download or share it.";
    } catch {
      status.textContent = "Could not prepare PDF. Retry, or use Print → Save as PDF.";
    }
  };
  const retry = button("Retry PDF", () => { if (!preparing) { preparing = prepare().finally(() => { preparing = undefined; }); } });
  share.disabled = save.disabled = print.disabled = true;
  frame.onload = () => {
    print.disabled = false;
    preparing = prepare().finally(() => { preparing = undefined; });
  };
  // Ignore any supplied document scripts: previews must never auto-print or execute data.
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.srcdoc = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  toolbar.append(heading, print, share, save, retry, button("Close", close), status);
  wrapper.append(toolbar, frame); document.body.append(wrapper); retry.focus();
}

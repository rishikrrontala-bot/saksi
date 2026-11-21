"use client";

/**
 * The Sealed Receipt as a PDF + QR (proposal §3 step 5): report ID, transaction hash, the commitment H,
 * the salt and the reporter's copy of the key. The machine-readable receipt is embedded in the PDF's
 * Keywords field, so the verifier can load this same file — one file to keep.
 */
import { jsPDF } from "jspdf";
import type { Receipt } from "./client";
import { CHAIN_NAME, explorerTx } from "./config";

const MARKER = "SAKSIRCPT1:";

function b64utf8(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}

export function receiptFromPdfText(text: string): string | null {
  const m = text.match(/SAKSIRCPT1:([A-Za-z0-9+/=]+)/);
  if (!m) return null;
  return decodeURIComponent(escape(atob(m[1])));
}

export function buildReceiptPdf(r: Receipt, qrDataUrl: string, verifyLink: string, ackDeadline: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: false });
  doc.setProperties({ title: `SAKSI Sealed Receipt #${r.reportId}`, subject: "SAKSI Sealed Receipt", keywords: MARKER + b64utf8(JSON.stringify(r)) });

  const L = 48;
  let y = 64;
  doc.setFillColor(179, 38, 30);
  doc.circle(L + 12, y - 6, 12, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(13).text("S", L + 8.2, y - 1.5);
  doc.setTextColor(20, 22, 27).setFontSize(20).text("SAKSI — Sealed Receipt", L + 34, y);
  y += 22;
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(95, 100, 114);
  doc.text("Proof that this report existed, for this institution, at this time — verifiable without the institution.", L, y);
  doc.addImage(qrDataUrl, "PNG", 420, 36, 126, 126);
  doc.setFontSize(7.5).text("Scan to verify (reveals no content)", 425, 172);

  y += 34;
  const row = (k: string, v: string, mono = false) => {
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(95, 100, 114).text(k.toUpperCase(), L, y);
    y += 13;
    doc.setFont(mono ? "courier" : "helvetica", "normal").setFontSize(mono ? 9 : 11).setTextColor(20, 22, 27);
    const lines = doc.splitTextToSize(v, 360);
    doc.text(lines, L, y);
    y += lines.length * (mono ? 11 : 14) + 10;
  };
  row("Report", `#${r.reportId}`);
  row("Institution", r.institutionName);
  const t = new Date(r.submittedAt * 1000);
  row(
    "Anchored at (block timestamp)",
    `${t.toUTCString()}  ·  ${t.toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })} WIB`
  );
  row("Task force must acknowledge by", ackDeadline);
  row("Chain · registry contract", `${CHAIN_NAME} (chain ${r.chainId}) · ${r.registry}`, true);
  row("Transaction", r.txHash, true);
  row("Fingerprint on-chain  H = keccak256(iv ‖ ciphertext ‖ salt)", r.commitment, true);

  y += 6;
  doc.setDrawColor(179, 38, 30).setLineWidth(1.2).roundedRect(L - 10, y - 14, 515, 128, 6, 6);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(179, 38, 30).text("PRIVATE — your keys. Anyone holding these can read your report.", L, y + 2);
  y += 20;
  row("Salt (opens the fingerprint)", r.salt, true);
  row("Report key (AES-256-GCM, base64)", r.key, true);

  y += 10;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(95, 100, 114);
  const help = doc.splitTextToSize(
    `To check status, prove the report existed, decrypt it, or escalate it after the deadline: open ${verifyLink.split("/verify")[0]}/verify and load this PDF. ` +
      `Anyone can also check the transaction independently: ${explorerTx(r.txHash)}`,
    500
  );
  doc.text(help, L, y);
  return doc;
}

const FREE_SCANS = 3;
const PASS_MS = 7 * 24 * 60 * 60 * 1000;
const $ = (s) => document.querySelector(s);
const state = { tab: "paste", imageText: "", last: null };
function store() {
  return {
    scans: Number(localStorage.getItem("ll_scans") || 0),
    passUntil: Number(localStorage.getItem("ll_pass") || 0),
    payUrl: localStorage.getItem("ll_pay") || "",
    history: JSON.parse(localStorage.getItem("ll_hist") || "[]")
  };
}
function save(p) {
  if (p.scans != null) localStorage.setItem("ll_scans", String(p.scans));
  if (p.passUntil != null) localStorage.setItem("ll_pass", String(p.passUntil));
  if (p.payUrl != null) localStorage.setItem("ll_pay", p.payUrl);
  if (p.history != null) localStorage.setItem("ll_hist", JSON.stringify(p.history.slice(0, 20)));
}
function hasPass() { return store().passUntil > Date.now(); }
function scansLeft() {
  if (hasPass()) return "Hunt pass on";
  const n = Math.max(0, FREE_SCANS - store().scans);
  return n + " free scan" + (n === 1 ? "" : "s") + " left";
}
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 1600);
}
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("on"));
  $("#screen-" + id).classList.add("on");
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("on", b.dataset.go === id));
  if (id === "history") renderHistory();
  if (id === "settings") $("#payUrl").value = store().payUrl;
  $("#scansLeft").textContent = scansLeft();
}
function setTab(tab) {
  state.tab = tab;
  $("#tab-paste").classList.toggle("on", tab === "paste");
  $("#tab-shot").classList.toggle("on", tab === "shot");
  $("#pane-paste").style.display = tab === "paste" ? "block" : "none";
  $("#pane-shot").style.display = tab === "shot" ? "block" : "none";
}
function canScan() { return hasPass() || store().scans < FREE_SCANS; }
function runAnalysis(text) {
  if (!canScan()) { $("#paywall").style.display = "grid"; return; }
  const result = analyzeListing(text);
  if (!result.ok) { toast(result.error); return; }
  const s = store();
  if (!hasPass()) save({ scans: s.scans + 1 });
  const hist = s.history;
  hist.unshift({ t: Date.now(), score: result.score, verdict: result.verdict, snippet: result.snippet });
  save({ history: hist });
  state.last = result;
  renderReport(result);
  show("report");
  $("#scansLeft").textContent = scansLeft();
}
function renderReport(r) {
  const hero = $("#scoreHero");
  hero.className = "score-hero " + (r.verdict === "likely_scam" ? "" : r.verdict === "caution" ? "caution" : "legit");
  const num = $("#scoreNum");
  num.textContent = r.score;
  num.className = "score-num " + (r.score < 40 ? "bad" : r.score < 68 ? "mid" : "good");
  const labels = { likely_scam: "Likely scam. Do not send money.", caution: "Caution. Tour first. No prepayment.", probably_legit: "No classic traps — still tour in person." };
  $("#verdict").textContent = labels[r.verdict];
  const bits = [];
  if (r.city_guess) bits.push(r.city_guess);
  if (r.asking_rent) bits.push("$" + r.asking_rent.toLocaleString() + "/mo");
  $("#reportMeta").textContent = bits.join(" · ") || "Listing parsed";
  $("#marketNote").textContent = r.market_note;
  $("#flags").innerHTML = r.flags.map((f) => `<div class="flag"><span class="pill ${f.level}">${f.level.toUpperCase()}</span>${f.text}</div>`).join("");
  $("#reply").textContent = r.reply;
}
function renderHistory() {
  const items = store().history;
  $("#historyList").innerHTML = items.length
    ? items.map((h) => `<div class="history-item"><div>${h.snippet || "Listing"}</div><strong>${h.score}</strong></div>`).join("")
    : "<p class='lede'>No scans yet.</p>";
}
async function ocrFile(file) {
  $("#ocrStatus").textContent = "Reading screenshot…";
  try {
    if (!window.Tesseract) throw new Error("ocr");
    const { data } = await Tesseract.recognize(file, "eng", {
      logger: (m) => { if (m.status === "recognizing text") $("#ocrStatus").textContent = "Reading screenshot " + Math.round(m.progress * 100) + "%"; }
    });
    state.imageText = data.text || "";
    $("#ocrStatus").textContent = state.imageText.trim() ? "Text pulled from image. Score it." : "Could not read much text. Paste the listing instead.";
  } catch (e) {
    $("#ocrStatus").textContent = "OCR unavailable. Paste the listing text.";
  }
}
function activatePass() {
  save({ passUntil: Date.now() + PASS_MS });
  $("#paywall").style.display = "none";
  toast("Hunt pass on for 7 days");
  $("#scansLeft").textContent = scansLeft();
}
function wire() {
  $("#tab-paste").onclick = () => setTab("paste");
  $("#tab-shot").onclick = () => setTab("shot");
  $("#goScan").onclick = () => {
    const text = state.tab === "shot" ? state.imageText : $("#listing").value;
    runAnalysis(text);
  };
  document.querySelectorAll("[data-sample]").forEach((b) => {
    b.onclick = () => { setTab("paste"); $("#listing").value = SAMPLES[b.dataset.sample]; runAnalysis(SAMPLES[b.dataset.sample]); };
  });
  $("#shotInput").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    $("#shotPreview").src = URL.createObjectURL(file);
    $("#shotPreview").style.display = "block";
    ocrFile(file);
  };
  $("#copyReply").onclick = async () => {
    try { await navigator.clipboard.writeText($("#reply").textContent); toast("Reply copied"); } catch { toast("Copy failed"); }
  };
  $("#newScan").onclick = () => show("home");
  $("#shareReport").onclick = async () => {
    const r = state.last; if (!r) return;
    const text = `LeaseLens score ${r.score}/100 — ${r.verdict.replace("_", " ")}. Don't wire a deposit before a tour.`;
    if (navigator.share) { try { await navigator.share({ title: "LeaseLens", text }); } catch {} }
    else { await navigator.clipboard.writeText(text); toast("Copied"); }
  };
  $("#buyPass").onclick = () => {
    const url = store().payUrl;
    if (url) window.open(url, "_blank");
    else toast("Add your Stripe link in Settings");
  };
  $("#devUnlock").onclick = activatePass;
  $("#saveSettings").onclick = () => { save({ payUrl: $("#payUrl").value.trim() }); toast("Saved"); };
  $("#resetApp").onclick = () => {
    localStorage.removeItem("ll_scans"); localStorage.removeItem("ll_pass"); localStorage.removeItem("ll_hist");
    toast("Reset"); show("home");
  };
  document.querySelectorAll(".nav button").forEach((b) => b.onclick = () => show(b.dataset.go));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
  $("#scansLeft").textContent = scansLeft();
}
document.addEventListener("DOMContentLoaded", wire);

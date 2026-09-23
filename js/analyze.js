const RULES = [
  { re: /\b(zelle|venmo|cash\s*app|cashapp|wire transfer|western union|moneygram|gift\s*card|crypto|bitcoin|usdt)\b/i, pts: -35, level: "red",
    text: "Wants payment by Zelle, Venmo, wire, gift card, or crypto before a real tour." },
  { re: /\b(deposit|first month|holding fee|reservation fee).{0,40}\b(before (you )?(see|tour|view)|to hold|to secure)\b/i, pts: -28, level: "red",
    text: "Asks for money to 'hold' the unit before you have seen it." },
  { re: /\b(i('m| am) (overseas|abroad|out of (the )?country|traveling|deployed)|can't (meet|show) (in person|right now)|keys (will be )?mailed|send the key)\b/i, pts: -24, level: "red",
    text: "Remote landlord / mailed keys / cannot meet in person — classic hijack pattern." },
  { re: /\b(ssn|social security|routing number|login to (your )?bank|photo of (your )?id and a selfie)\b/i, pts: -40, level: "red",
    text: "Asks for SSN, bank login, or ID pack before a showing." },
  { re: /\b(other (applicants|people) (are )?coming|won'?t last|today only|act (fast|now)|first person to (wire|pay))\b/i, pts: -10, level: "yellow",
    text: "Pressure language designed to skip verification." },
  { re: /\b(no credit check|no background|anyone welcome)\b/i, pts: -8, level: "yellow",
    text: "Too-easy screening combined with other flags is a common bait listing." },
  { re: /\b(tour|showing|open house|see the (unit|place|apartment)|in person)\b/i, pts: 12, level: "green",
    text: "Offers an in-person tour — legitimacy signal." },
  { re: /\b(property manager|management company|broker|realtor|licen[sc]e ?#)\b/i, pts: 8, level: "green",
    text: "Names a manager, broker, or license — easier to verify." },
  { re: /\b(lease|rental agreement|rent control|rent board)\b/i, pts: 6, level: "green",
    text: "Talks about a written lease / local rent rules." }
];

const SF_NEIGHBORHOODS = [
  ["soma", 2800, 4200], ["mission", 2400, 3800], ["castro", 2600, 4000],
  ["sunset", 2200, 3400], ["richmond", 2300, 3500], ["nob hill", 2800, 4500],
  ["tenderloin", 1600, 2800], ["hayes valley", 2800, 4200], ["marina", 3000, 4800],
  ["north beach", 2600, 4000], ["excelsior", 1900, 3000], ["bayview", 1800, 2900],
  ["potrero", 2800, 4200], ["haight", 2400, 3600], ["pacific heights", 3200, 5200],
  ["financial district", 3000, 4800], ["chinatown", 1800, 3000]
];

function extractRent(text) {
  const m = text.match(/\$\s?([0-9]{1,2}[,][0-9]{3}|[0-9]{3,5})\b/);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}
function extractCity(text) {
  const t = text.toLowerCase();
  if (/\b(san francisco|sf\b|soma|mission district|sunset district)\b/.test(t)) return "San Francisco";
  if (/\boakland\b/.test(t)) return "Oakland";
  if (/\bberkeley\b/.test(t)) return "Berkeley";
  return "";
}
function marketNote(text, rent) {
  const t = text.toLowerCase();
  const hit = SF_NEIGHBORHOODS.find(([n]) => t.includes(n));
  if (!hit || !rent) {
    if (rent && rent < 1200 && /sf|san francisco|mission|soma/.test(t)) {
      return "Asking rent is far below any realistic occupied SF unit. Treat as bait until proven otherwise.";
    }
    return rent ? `Listed at $${rent.toLocaleString()}. Compare against recent leases on that exact block.` : "No rent detected. Ask for the full monthly total including fees.";
  }
  const [name, lo, hi] = hit;
  if (rent < lo * 0.75) return `$${rent.toLocaleString()} in ${name} is well under a typical floor. Strong bait-price signal.`;
  if (rent > hi * 1.15) return `$${rent.toLocaleString()} is rich for ${name}. Not a scam signal by itself.`;
  return `$${rent.toLocaleString()} sits inside a normal ${name} band ($${lo.toLocaleString()}–$${hi.toLocaleString()}).`;
}
function buildReply(verdict) {
  if (verdict === "likely_scam") return "Thanks for sending this. I only tour in person and I never send a deposit, Zelle, or holding fee before I've walked the unit and read a lease with the owner's legal name on it. If you can do a showing this week at the actual address, send two time windows. If not, I'll pass.";
  if (verdict === "caution") return "Interested if the unit is real. I can tour this week. I don't send money before an in-person showing and a draft lease. Please confirm the exact street address and who will be at the door.";
  return "I'd like to tour. Please confirm the exact address, monthly total with all fees, and that we'll review a written lease before any funds move.";
}
function analyzeListing(raw) {
  const text = (raw || "").trim();
  if (text.length < 20) return { ok: false, error: "Need more text — paste the full ad or a clearer screenshot." };
  let score = 72;
  const flags = [];
  const seen = new Set();
  for (const rule of RULES) {
    if (rule.re.test(text) && !seen.has(rule.text)) {
      seen.add(rule.text);
      score += rule.pts;
      flags.push({ level: rule.level, text: rule.text });
    }
  }
  if (!/\d{1,5}\s+\w+/.test(text) && !/\b(near|at)\s+\w+\s+(and|&|\/)\s+\w+/.test(text)) {
    score -= 10;
    flags.push({ level: "yellow", text: "No street address — only a neighborhood or cross-street." });
  }
  const rent = extractRent(text);
  const city = extractCity(text);
  if (rent && city === "San Francisco" && rent < 1400 && !/room|shared|roommate|sro/.test(text.toLowerCase())) {
    score -= 16;
    flags.push({ level: "red", text: "Whole-unit SF rent under $1,400 is almost never real in 2026." });
  }
  score = Math.max(0, Math.min(100, score));
  let verdict = "probably_legit";
  if (score < 40) verdict = "likely_scam";
  else if (score < 68) verdict = "caution";
  if (!flags.length) flags.push({ level: "yellow", text: "No classic scam phrases. Still tour in person. Never wire a stranger." });
  return { ok: true, score, verdict, city_guess: city, asking_rent: rent, flags, market_note: marketNote(text, rent), reply: buildReply(verdict), snippet: text.slice(0, 90).replace(/\s+/g, " ") };
}
const SAMPLES = {
  scam: `SUNNY MISSION STUDIO $1,150/mo!!! Available now. I'm the owner but currently traveling in Europe for work so I can't show the unit. Photos are current. To hold the apartment please Zelle the first month and deposit ($2,300) and I will mail the keys and lease. First person to pay gets it — other applicants coming today. No credit check needed.`,
  caution: `1BR in the Inner Sunset, $2,650/mo. Photos attached. Cross street 19th Ave / Irving. I can try to show this weekend if my schedule works. Message me here, I don't use a property manager. First month + deposit to hold after you see it.`,
  legit: `Managed by Hayes Park Properties (Broker license #0182xxxx). 2BR in Hayes Valley, $3,795/mo + water. Open house Saturday 11–1 at 400 block of Linden St. Written lease, Rent Board covered, standard screening. No funds accepted before tour.`
};

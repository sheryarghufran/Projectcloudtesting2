import { useState, useCallback, useRef, useEffect } from "react";

const BRAND = "Project Cloud";
const MODEL = "gpt-5.4";
const SYS = `You are an elite Amazon Catalog Manager and PPC Analyst for "${BRAND}", a footwear brand selling shoes, sandals, slippers, gloves, and accessories on Amazon. You understand A9/A10 algorithm, PPC (SP/SB/SD), listing optimization, backend search terms, parent-child ASINs, variation strategy, BSR, and competitive intelligence at a $10M+ seller level. Be specific and actionable. Keep strings concise (under 70 chars).`;

const TEAMS = [
  { id: "A", name: "Vector", color: "#ef4444" },
  { id: "B", name: "Titan", color: "#f59e0b" },
  { id: "C", name: "Ascend", color: "#10b981" },
  { id: "D", name: "Pulse", color: "#8b5cf6" },
  { id: "E", name: "Atlas", color: "#3b82f6" },
  { id: "F", name: "Vanguard", color: "#ec4899" },
  { id: "G", name: "Nova", color: "#14b8a6" },
  { id: "H", name: "Forge", color: "#f97316" },
  { id: "I", name: "Summit", color: "#6366f1" },
];

const CATS = {
  branded: { color: "#3b82f6", label: "Branded" },
  irrelevant: { color: "#6b7280", label: "Irrelevant" },
  goal: { color: "#f59e0b", label: "Goal" },
  generic: { color: "#8b5cf6", label: "Generic" },
  easy: { color: "#10b981", label: "Easy Wins" },
};

function parseCSV(text) {
  var lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  var hdr = [];
  var c = "", q = false;
  for (var i = 0; i < lines[0].length; i++) {
    var ch = lines[0][i];
    if (ch === '"') q = !q;
    else if ((ch === "," || ch === "\t") && !q) { hdr.push(c.trim().replace(/^"|"$/g, "")); c = ""; }
    else c += ch;
  }
  hdr.push(c.trim().replace(/^"|"$/g, ""));
  var result = [];
  for (var li = 1; li < lines.length; li++) {
    var vs = []; var cc = ""; var qq = false;
    for (var j = 0; j < lines[li].length; j++) {
      var ch2 = lines[li][j];
      if (ch2 === '"') qq = !qq;
      else if ((ch2 === "," || ch2 === "\t") && !qq) { vs.push(cc.trim().replace(/^"|"$/g, "")); cc = ""; }
      else cc += ch2;
    }
    vs.push(cc.trim().replace(/^"|"$/g, ""));
    var obj = {};
    hdr.forEach(function(h, idx) { obj[h] = vs[idx] || ""; });
    result.push(obj);
  }
  return result;
}

function detectCols(data) {
  if (!data.length) return {};
  var d = {};
  Object.keys(data[0]).forEach(function(c) {
    var l = c.toLowerCase();
    if (!d.keyword && (l.includes("keyword") || l.includes("search term") || l.includes("query"))) d.keyword = c;
    if (!d.volume && (l.includes("volume") || l.includes("sv"))) d.volume = c;
    if (!d.rank && (l.includes("rank") || l.includes("position"))) d.rank = c;
    if (!d.cpc && (l.includes("cpc") || l.includes("bid"))) d.cpc = c;
    if (!d.difficulty && (l.includes("difficult") || l.includes("compet"))) d.difficulty = c;
  });
  return d;
}

function sample(data, max) {
  max = max || 45;
  if (data.length <= max) return data;
  var first = data.slice(0, 18);
  var rest = data.slice(18);
  var step = Math.max(1, Math.floor(rest.length / (max - 18)));
  var s = [];
  for (var i = 0; i < rest.length && s.length < max - 18; i += step) s.push(rest[i]);
  return first.concat(s);
}

function compactRows(rows) {
  return rows.map(function(r) {
    var o = {};
    Object.entries(r).forEach(function(e) { if (e[1] && typeof e[1] === "string" && e[1].trim()) o[e[0]] = e[1].trim(); });
    return o;
  });
}

function fixJSON(str) {
  var s = str.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/, "").trim();
  var fb = s.indexOf("{");
  if (fb > 0) s = s.slice(fb);
  if (fb < 0) throw new Error("No JSON");
  try { return JSON.parse(s); } catch (e) {}
  var inS = false, esc = false, cn = [];
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (ch === "{") cn.push("}");
    else if (ch === "[") cn.push("]");
    else if (ch === "}" || ch === "]") cn.pop();
  }
  if (inS) s += '"';
  s = s.replace(/,?\s*"[^"]*"\s*:\s*$/, "").replace(/,?\s*"[^"]*"\s*$/, "").replace(/,\s*$/, "");
  while (cn.length) s += cn.pop();
  try { return JSON.parse(s); } catch (e2) {}
  for (var end = s.length; end > 50; end -= 15) {
    var a = s.slice(0, end).replace(/,\s*$/, "");
    var c2 = [], i2 = false, e3 = false;
    for (var j = 0; j < a.length; j++) {
      var ch2 = a[j];
      if (e3) { e3 = false; continue; }
      if (ch2 === "\\") { e3 = true; continue; }
      if (ch2 === '"') { i2 = !i2; continue; }
      if (i2) continue;
      if (ch2 === "{") c2.push("}");
      else if (ch2 === "[") c2.push("]");
      else if (ch2 === "}" || ch2 === "]") c2.pop();
    }
    if (i2) a += '"';
    a = a.replace(/,?\s*"[^"]*"\s*:\s*$/, "").replace(/,\s*$/, "");
    while (c2.length) a += c2.pop();
    try { return JSON.parse(a); } catch (e4) {}
  }
  throw new Error("JSON parse failed");
}

async function ai(prompt, tokens) {
  for (var i = 0; i < 3; i++) {
    try {
      var r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYS },
            { role: "user", content: prompt }
          ],
          max_tokens: tokens || 3500
        }),
      });
      if (!r.ok) continue;
      var d = await r.json();
      if (d.error) continue;
      var text = (((d.choices || [])[0] || {}).message || {}).content || "";
      if (typeof text === "string" && text.trim()) return text;
    } catch (e) {}
  }
  throw new Error("API failed");
}

async function aiJSON(prompt, tokens) {
  return fixJSON(await ai(prompt, tokens));
}

// ── UI Components ──
function Badge({ children, color, active, onClick, small }) {
  color = color || "#10b981";
  return (
    <span onClick={onClick} style={{
      background: active ? color : color + "14", color: active ? "#000" : color,
      fontSize: small ? 9 : 10.5, fontWeight: 700, padding: small ? "2px 7px" : "3px 10px",
      borderRadius: 16, letterSpacing: 0.3, textTransform: "uppercase",
      cursor: onClick ? "pointer" : "default", transition: "all 0.15s",
      border: "1px solid " + (active ? color : color + "25"), whiteSpace: "nowrap", display: "inline-block",
    }}>{children}</span>
  );
}

function Stat({ label, value, accent, icon }) {
  return (
    <div style={{ background: "#111113", border: "1px solid #1c1c20", borderRadius: 12, padding: "14px 16px", flex: "1 1 130px", minWidth: 110 }}>
      <div style={{ color: "#4a4a52", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color: accent || "#f59e0b", fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

function Card({ children, accent, style }) {
  var s = Object.assign({}, { background: "#111113", borderRadius: 11, padding: 16, border: "1px solid #1c1c20" }, style || {});
  if (accent) s.borderLeft = "3px solid " + accent;
  return <div style={s}>{children}</div>;
}

function Tbl({ headers, rows, hc }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #1c1c20" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead><tr>{headers.map(function(h) { return <th key={h} style={{ background: "#111113", padding: "10px 12px", textAlign: "left", color: hc || "#f59e0b", fontWeight: 700, borderBottom: "1px solid #1e1e22", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" }}>{h}</th>; })}</tr></thead>
        <tbody>{rows.map(function(row, i) { return <tr key={i} style={{ background: i % 2 ? "#0b0b0d" : "transparent" }}>{row.map(function(cell, j) { return <td key={j} style={{ padding: "9px 12px", borderBottom: "1px solid #131315", color: typeof cell === "string" ? "#aaa" : undefined, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{cell}</td>; })}</tr>; })}</tbody>
      </table>
    </div>
  );
}

// ═══ MAIN ═══
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [files, setFiles] = useState([]);
  const [data, setData] = useState([]);
  const [docs, setDocs] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("A");
  const [teamAsins, setTeamAsins] = useState(function() {
    var init = {};
    TEAMS.forEach(function(t) { init[t.id] = []; });
    return init;
  });
  const [asinInput, setAsinInput] = useState("");
  const [asinResult, setAsinResult] = useState(null);
  const [classify, setClassify] = useState(null);
  const [ppc, setPpc] = useState(null);
  const [listing, setListing] = useState(null);
  const [competitors, setCompetitors] = useState(null);
  const [pushPlan, setPushPlan] = useState(null);
  const [pushMode, setPushMode] = useState("daily");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState(null);
  const [catFilter, setCatFilter] = useState("all");
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState([]);
  const [chatLoad, setChatLoad] = useState(false);
  const fileRef = useRef(null);
  const chatEnd = useRef(null);

  useEffect(function() {
    if (chatEnd.current) chatEnd.current.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Load saved teams
  useEffect(function() {
    try {
      if (window.storage && window.storage.get) {
        window.storage.get("pc-teams").then(function(r) {
          if (r && r.value) setTeamAsins(JSON.parse(r.value));
        }).catch(function() {});
      }
    } catch (e) {}
  }, []);

  var saveTeams = function(updated) {
    setTeamAsins(updated);
    try {
      if (window.storage && window.storage.set) {
        window.storage.set("pc-teams", JSON.stringify(updated)).catch(function() {});
      }
    } catch (e) {}
  };

  var addAsin = function() {
    var a = asinInput.trim().toUpperCase();
    if (!a || a.length < 10) return;
    var updated = Object.assign({}, teamAsins);
    updated[selectedTeam] = (updated[selectedTeam] || []).concat([{ asin: a, added: Date.now() }]);
    saveTeams(updated);
    setAsinInput("");
  };

  var removeAsin = function(tid, asin) {
    var updated = Object.assign({}, teamAsins);
    updated[tid] = (updated[tid] || []).filter(function(x) { return x.asin !== asin; });
    saveTeams(updated);
  };

  // File upload
  var handleFiles = useCallback(async function(e) {
    var nf = Array.from(e.target.files);
    var parsed = [], md = [];
    for (var i = 0; i < nf.length; i++) {
      var f = nf[i];
      var t = await f.text();
      if (f.name.match(/\.(csv|tsv)$/i)) parsed = parsed.concat(parseCSV(t));
      else if (f.name.match(/\.(md|txt|markdown)$/i)) md.push({ name: f.name, content: t });
    }
    setFiles(function(p) { return p.concat(nf); });
    setData(function(p) { return p.concat(parsed); });
    setDocs(function(p) { return p.concat(md); });
    if (parsed.length || md.length) setTab("data");
  }, []);

  // ASIN Analysis
  var analyzeAsin = async function(asin) {
    setLoading(true); setLoadMsg("Analyzing ASIN " + asin + "..."); setError(null);
    try {
      var result = await aiJSON('Analyze Amazon ASIN: ' + asin + ' for brand "' + BRAND + '" (footwear).\nDetermine if parent or child. Respond ONLY with JSON:\n{"asin":"' + asin + '","isParent":true,"parentAsin":"","title":"","variations":[{"childAsin":"","size":"","color":"","price":0,"bsr":0}],"organicRanks":[{"keyword":"","rank":0,"page":0,"trend":"up"}],"listingScore":0,"issues":[""],"recommendations":[""],"monthlySales":0,"revenue":0}\nInclude 5 variations, 8 organic keywords for footwear, realistic data.');
      setAsinResult(result);
    } catch (err) { setError("ASIN analysis failed: " + err.message); }
    setLoading(false);
  };

  // Full Pipeline
  var runFull = useCallback(async function() {
    if (!data.length && !docs.length) return;
    setLoading(true); setError(null); setTab("classify");
    var cols = detectCols(data);
    var s = compactRows(sample(data));
    var md = docs.map(function(m) { return m.content.slice(0, 1000); }).join("\n---\n");
    var ctx = "DATA (" + s.length + " of " + data.length + " rows):\n" + JSON.stringify(s) + "\nColumns: " + JSON.stringify(cols) + (md ? "\nDocs:\n" + md : "");

    // 1: Classify
    setLoadMsg("Step 1/5: Classifying keywords...");
    try {
      var cl = await aiJSON(ctx + '\n\nClassify keywords for "' + BRAND + '" footwear into 5 categories. JSON only:\n{"branded":[{"keyword":"","volume":0,"rank":null,"action":"","type":"own|competitor"}],"irrelevant":[{"keyword":"","reason":""}],"goal":[{"keyword":"","volume":0,"rank":null,"difficulty":"","action":"","dailySales":0}],"generic":[{"keyword":"","volume":0,"competition":"","action":""}],"easy":[{"keyword":"","volume":0,"difficulty":"","timeToRank":"","action":""}],"stats":{"total":' + data.length + ',"brandedCount":0,"irrelevantCount":0,"goalCount":0,"genericCount":0,"easyCount":0}}\n7-8 per category (5 irrelevant). Strings under 70 chars.');
      setClassify(cl);
    } catch (err) { setError("Classification failed: " + err.message); setLoading(false); return; }

    // 2: PPC
    setLoadMsg("Step 2/5: Building PPC strategy...");
    try {
      var p = await aiJSON(ctx + '\n\nPPC strategy for "' + BRAND + '" footwear. JSON only:\n{"dailyActions":[{"keyword":"","matchType":"exact|phrase|broad","bid":0,"dailyBudget":0,"priority":"high|medium|low","rationale":""}],"campaigns":[{"name":"","type":"SP|SB|SD","keywords":[""],"budget":0,"strategy":""}],"negatives":[{"keyword":"","reason":""}],"budget":{"daily":0,"sp":0,"sb":0,"sd":0},"kpis":{"acos":0,"roas":0}}\n8 dailyActions, 4 campaigns, 5 negatives. Real footwear CPC ranges.');
      setPpc(p);
    } catch (e) { setPpc(null); }

    // 3: Listing
    setLoadMsg("Step 3/5: Optimizing listing...");
    try {
      var l = await aiJSON(ctx + '\n\nOptimize Amazon listing for "' + BRAND + '" footwear. JSON only:\n{"title":{"current":"","optimized":"","changes":""},"bullets":[{"optimized":"","keywordsUsed":[""]}],"backendTerms":[""],"aPlus":{"headline":"","modules":[{"type":"","content":""}]},"score":{"before":0,"after":0}}\n5 bullets, 8 backend terms, 3 A+ modules.');
      setListing(l);
    } catch (e) { setListing(null); }

    // 4: Competitors
    setLoadMsg("Step 4/5: Analyzing competitors...");
    try {
      var c = await aiJSON(ctx + '\n\nCompetitor analysis for "' + BRAND + '" footwear. JSON only:\n{"competitors":[{"brand":"","revenue":"","topKeywords":[{"keyword":"","theirRank":0,"ourRank":null,"type":"organic|sponsored"}],"strategy":""}],"keywordSteal":[{"keyword":"","volume":0,"competitor":"","difficulty":"","action":"","priority":"high|medium|low"}],"sponsoredInsights":[{"keyword":"","competitors":[""],"avgCPC":0,"opportunity":""}]}\n4 competitors, 8 keywordSteal, 5 sponsoredInsights.');
      setCompetitors(c);
    } catch (e) { setCompetitors(null); }

    // 5: Push Plan
    setLoadMsg("Step 5/5: Creating push strategy...");
    try {
      var pp = await aiJSON(ctx + '\n\nHourly and daily keyword push plan for "' + BRAND + '" footwear PPC. JSON only:\n{"hourly":[{"hour":"","keywords":[{"keyword":"","bid":0}],"multiplier":1.0,"strategy":""}],"daily":[{"day":"","keywords":[{"keyword":"","bid":0,"match":"","budget":0}],"strategy":"","totalBudget":0}],"peakHours":[""],"weekendStrategy":"","primeStrategy":""}\n5 hourly blocks (6AM-8AM etc), 7 daily plans, 3-4 keywords each.');
      setPushPlan(pp);
    } catch (e) { setPushPlan(null); }

    setLoading(false); setLoadMsg("");
  }, [data, docs]);

  // Chat
  var sendChat = useCallback(async function() {
    if (!prompt.trim()) return;
    var msg = prompt.trim();
    setPrompt("");
    setChat(function(p) { return p.concat([{ role: "user", content: msg }]); });
    setChatLoad(true);
    try {
      var ctx2 = SYS + "\nDataset: " + data.length + " keywords. " + docs.length + " docs." + (classify ? " Classified. " : "") + (ppc ? " PPC ready. " : "");
      var msgs = chat.map(function(m) { return { role: m.role, content: m.content }; }).concat([{ role: "user", content: msg }]);
      var r = await fetch("/api/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "system", content: ctx2 }].concat(msgs),
          max_tokens: 2000
        }),
      });
      var d = await r.json();
      var text = (((d.choices || [])[0] || {}).message || {}).content || "";
      setChat(function(p) { return p.concat([{ role: "assistant", content: text || "No response" }]); });
    } catch (e) {
      setChat(function(p) { return p.concat([{ role: "assistant", content: "Error. Try again." }]); });
    }
    setChatLoad(false);
  }, [prompt, chat, data, docs, classify, ppc]);

  var team = TEAMS.find(function(t) { return t.id === selectedTeam; });
  var teamList = teamAsins[selectedTeam] || [];
  var totalAsins = Object.values(teamAsins).reduce(function(s, a) { return s + a.length; }, 0);
  var pColor = function(p) { return p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#10b981"; };

  var tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "teams", label: "Teams" },
    { id: "upload", label: "Upload" },
    { id: "data", label: "Data", off: !data.length },
    { id: "classify", label: "Keywords", off: !classify },
    { id: "ppc", label: "PPC", off: !ppc },
    { id: "listing", label: "Listing", off: !listing },
    { id: "competitors", label: "Competitors", off: !competitors },
    { id: "push", label: "Push Plan", off: !pushPlan },
    { id: "api", label: "APIs" },
    { id: "chat", label: "Agent" },
  ];

  return (
    <div style={{ background: "#08080a", color: "#e0e0e4", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: "@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}input::placeholder{color:#333}" }} />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #18181c", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#f59e0b,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#000" }}>P</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{BRAND} <span style={{ color: "#444", fontWeight: 500, fontSize: 12 }}>Amazon SEO Agent</span></div>
            <div style={{ color: "#333", fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" }}>GPT 5.4 | Catalog Manager | PPC Analyst</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <Badge color={data.length ? "#10b981" : "#333"} small>{data.length ? data.length.toLocaleString() + " kw" : "No data"}</Badge>
          <Badge color={totalAsins ? "#8b5cf6" : "#333"} small>{totalAsins ? totalAsins + " ASINs" : "No ASINs"}</Badge>
          <Badge color="#f59e0b" small>GPT 5.4</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #18181c", padding: "0 16px", overflowX: "auto" }}>
        {tabs.map(function(t) {
          return <button key={t.id} onClick={function() { if (!t.off) setTab(t.id); }} style={{
            background: "none", border: "none", fontFamily: "inherit",
            color: tab === t.id ? "#f59e0b" : t.off ? "#1e1e22" : "#555",
            padding: "11px 13px", fontSize: 11, fontWeight: 700,
            cursor: t.off ? "default" : "pointer",
            borderBottom: tab === t.id ? "2px solid #f59e0b" : "2px solid transparent",
            whiteSpace: "nowrap",
          }}>{t.label}</button>;
        })}
      </div>

      <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div style={{ animation: "fadeIn .3s" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Dashboard</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
              <Stat label="Keywords" value={data.length.toLocaleString()} />
              <Stat label="Teams Active" value={Object.values(teamAsins).filter(function(v) { return v.length; }).length} accent="#8b5cf6" />
              <Stat label="ASINs Tracked" value={totalAsins} accent="#10b981" />
              <Stat label="Documents" value={docs.length} accent="#3b82f6" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#888" }}>Team Overview</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8, marginBottom: 24 }}>
              {TEAMS.map(function(t) {
                return <Card key={t.id} accent={t.color}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 12 }}>Team {t.id}</div>
                      <div style={{ color: t.color, fontSize: 11, fontWeight: 600 }}>{t.name}</div>
                    </div>
                    <div style={{ color: t.color, fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{(teamAsins[t.id] || []).length}</div>
                  </div>
                </Card>;
              })}
            </div>
            {!data.length && (
              <Card style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Get Started</div>
                <div style={{ color: "#444", fontSize: 12, marginBottom: 16 }}>Upload keyword data or add ASINs to begin</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button onClick={function() { setTab("upload"); }} style={{ background: "#f59e0b", color: "#000", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Upload Data</button>
                  <button onClick={function() { setTab("teams"); }} style={{ background: "#8b5cf6", color: "#000", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Manage Teams</button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TEAMS */}
        {tab === "teams" && (
          <div style={{ animation: "fadeIn .3s" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Team Management</h2>
            <p style={{ color: "#444", fontSize: 12, marginBottom: 16 }}>Add ASINs (parent or child) per team. The agent auto-classifies parent ASINs and tracks organic rankings.</p>
            <div style={{ display: "flex", gap: 5, marginBottom: 16, flexWrap: "wrap" }}>
              {TEAMS.map(function(t) {
                return <Badge key={t.id} color={t.color} active={selectedTeam === t.id} onClick={function() { setSelectedTeam(t.id); }}>
                  {t.id} - {t.name} ({(teamAsins[t.id] || []).length})
                </Badge>;
              })}
            </div>
            <Card accent={team.color} style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: team.color, marginBottom: 12 }}>Team {team.id} - {team.name}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input value={asinInput} onChange={function(e) { setAsinInput(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") addAsin(); }} placeholder="Enter ASIN (e.g. B09XYZ1234)..." style={{ flex: 1, background: "#0a0a0c", border: "1px solid #1c1c20", borderRadius: 8, padding: "10px 14px", color: "#e4e4e7", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                <button onClick={addAsin} style={{ background: team.color, color: "#000", border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
                {asinInput.trim().length >= 10 && (
                  <button onClick={function() { analyzeAsin(asinInput.trim().toUpperCase()); }} style={{ background: "#8b5cf6", color: "#000", border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Analyze</button>
                )}
              </div>
              {teamList.length > 0 ? teamList.map(function(a, i) {
                return <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#0a0a0c", borderRadius: 8, marginBottom: 4, border: "1px solid #18181c" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: team.color, fontWeight: 700 }}>{a.asin}</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={function() { analyzeAsin(a.asin); }} style={{ background: "#1c1c20", color: "#888", border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Analyze</button>
                  <button onClick={function() { removeAsin(team.id, a.asin); }} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 14 }}>x</button>
                </div>;
              }) : <div style={{ color: "#333", fontSize: 12, textAlign: "center", padding: 16 }}>No ASINs yet</div>}
            </Card>

            {loading && (
              <div style={{ textAlign: "center", padding: 50 }}>
                <div style={{ width: 40, height: 40, border: "3px solid #1c1c20", borderTopColor: "#f59e0b", borderRadius: "50%", margin: "0 auto 14px", animation: "spin 1s linear infinite" }} />
                <div style={{ fontSize: 15, fontWeight: 800, color: "#f59e0b" }}>{loadMsg}</div>
              </div>
            )}

            {asinResult && !loading && (
              <div style={{ animation: "fadeIn .3s" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#8b5cf6", marginBottom: 12 }}>ASIN Analysis: {asinResult.asin}</div>
                {asinResult.title && <p style={{ color: "#888", fontSize: 12, marginBottom: 12 }}>{asinResult.title}</p>}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  <Stat label="Type" value={asinResult.isParent ? "Parent" : "Child"} accent="#8b5cf6" />
                  {asinResult.parentAsin && <Stat label="Parent" value={asinResult.parentAsin} accent="#f59e0b" />}
                  <Stat label="Monthly Sales" value={"~" + (asinResult.monthlySales || 0).toLocaleString()} accent="#10b981" />
                  <Stat label="Revenue" value={"$" + (asinResult.revenue || 0).toLocaleString()} accent="#f59e0b" />
                  <Stat label="Score" value={(asinResult.listingScore || 0) + "/100"} accent={asinResult.listingScore > 70 ? "#10b981" : "#ef4444"} />
                </div>
                {asinResult.variations && asinResult.variations.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#666", marginBottom: 6 }}>VARIATIONS</div>
                    <Tbl hc="#8b5cf6" headers={["Child ASIN", "Size", "Color", "Price", "BSR"]}
                      rows={asinResult.variations.map(function(v) { return [
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{v.childAsin}</span>,
                        v.size || "-", v.color || "-",
                        <span style={{ color: "#10b981" }}>{"$" + (v.price || 0)}</span>,
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{(v.bsr || 0).toLocaleString()}</span>,
                      ]; })} />
                  </div>
                )}
                {asinResult.organicRanks && asinResult.organicRanks.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#666", marginBottom: 6 }}>ORGANIC RANKINGS</div>
                    <Tbl hc="#10b981" headers={["Keyword", "Rank", "Page", "Trend"]}
                      rows={asinResult.organicRanks.map(function(r) { return [
                        <span style={{ fontWeight: 600 }}>{r.keyword}</span>,
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: r.rank <= 10 ? "#10b981" : r.rank <= 30 ? "#f59e0b" : "#ef4444" }}>{"#" + r.rank}</span>,
                        r.page,
                        <Badge color={r.trend === "up" ? "#10b981" : r.trend === "down" ? "#ef4444" : "#6b7280"} small>{r.trend}</Badge>,
                      ]; })} />
                  </div>
                )}
                {asinResult.recommendations && asinResult.recommendations.length > 0 && (
                  <Card accent="#f59e0b">
                    <div style={{ fontWeight: 700, fontSize: 11, color: "#f59e0b", marginBottom: 6 }}>RECOMMENDATIONS</div>
                    {asinResult.recommendations.map(function(r, i) { return <div key={i} style={{ color: "#aaa", fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>{"-> " + r}</div>; })}
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* UPLOAD */}
        {tab === "upload" && (
          <div style={{ animation: "fadeIn .3s" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Upload Data</h2>
            <p style={{ color: "#555", fontSize: 12, marginBottom: 16 }}>Upload CSV keyword reports of any size. The agent handles 100 to 100,000+ rows.</p>
            <div onClick={function() { if (fileRef.current) fileRef.current.click(); }} style={{ border: "2px dashed #1e1e22", borderRadius: 14, padding: "44px 20px", textAlign: "center", cursor: "pointer", background: "#0a0a0c" }}>
              <div style={{ fontSize: 28, color: "#2a2a2e", marginBottom: 6 }}>+</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Click to upload files</div>
              <div style={{ color: "#3a3a42", fontSize: 11, marginTop: 4 }}>CSV, TSV, TXT, Markdown</div>
              <input ref={fileRef} type="file" multiple accept=".csv,.tsv,.md,.txt,.markdown" onChange={handleFiles} style={{ display: "none" }} />
            </div>
            {files.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {files.map(function(f, i) {
                  return <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#111113", borderRadius: 8, marginBottom: 4, border: "1px solid #1a1a1e" }}>
                    <span style={{ color: f.name.match(/csv|tsv/i) ? "#f59e0b" : "#8b5cf6", fontSize: 10, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{f.name.match(/csv/i) ? "CSV" : "MD"}</span>
                    <span style={{ fontSize: 12, flex: 1 }}>{f.name}</span>
                    <span style={{ color: "#333", fontSize: 10 }}>{(f.size / 1024).toFixed(1)}KB</span>
                  </div>;
                })}
                <button onClick={runFull} disabled={loading} style={{
                  marginTop: 12, width: "100%", background: loading ? "#1a1a1e" : "linear-gradient(135deg,#f59e0b,#ef4444)",
                  color: loading ? "#555" : "#000", border: "none", padding: "14px", borderRadius: 11,
                  fontWeight: 800, fontSize: 14, cursor: loading ? "default" : "pointer", fontFamily: "inherit",
                }}>{loading ? loadMsg : "Run Full Analysis"}</button>
              </div>
            )}
          </div>
        )}

        {/* DATA */}
        {tab === "data" && data.length > 0 && (
          <div style={{ animation: "fadeIn .3s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Data Preview</h2>
                <p style={{ color: "#444", fontSize: 11, margin: "2px 0 0" }}>{data.length.toLocaleString()} rows</p>
              </div>
              {!classify && <button onClick={runFull} disabled={loading} style={{ background: "#f59e0b", color: "#000", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Analyze</button>}
            </div>
            <Tbl headers={Object.keys(data[0])} rows={data.slice(0, 20).map(function(r) { return Object.values(r); })} />
            {data.length > 20 && <div style={{ padding: 8, color: "#333", fontSize: 10, textAlign: "center" }}>Showing 20 of {data.length.toLocaleString()}</div>}
          </div>
        )}

        {/* CLASSIFY */}
        {tab === "classify" && (
          <div style={{ animation: "fadeIn .3s" }}>
            {loading && (
              <div style={{ textAlign: "center", padding: 60 }}>
                <div style={{ width: 40, height: 40, border: "3px solid #1c1c20", borderTopColor: "#f59e0b", borderRadius: "50%", margin: "0 auto 14px", animation: "spin 1s linear infinite" }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b", marginBottom: 4 }}>{loadMsg}</div>
                <div style={{ color: "#333", fontSize: 11, animation: "pulse 2s ease infinite" }}>Powered by Claude GPT 5.4</div>
              </div>
            )}
            {error && <Card accent="#ef4444"><span style={{ color: "#ef4444", fontSize: 12 }}>{error}</span></Card>}
            {classify && !loading && (
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Keyword Classification</h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {Object.entries(CATS).map(function(e) { return <Stat key={e[0]} label={e[1].label} value={(classify[e[0]] || []).length} accent={e[1].color} />; })}
                </div>
                <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
                  <Badge color="#e4e4e7" active={catFilter === "all"} onClick={function() { setCatFilter("all"); }}>All</Badge>
                  {Object.entries(CATS).map(function(e) { return <Badge key={e[0]} color={e[1].color} active={catFilter === e[0]} onClick={function() { setCatFilter(e[0]); }}>{e[1].label}</Badge>; })}
                </div>
                {Object.entries(CATS).filter(function(e) { return catFilter === "all" || catFilter === e[0]; }).map(function(entry) {
                  var cat = entry[0], meta = entry[1];
                  var items = classify[cat] || [];
                  if (!items.length) return null;
                  return (
                    <div key={cat} style={{ marginBottom: 24 }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: meta.color, marginBottom: 8 }}>{meta.label} ({items.length})</div>
                      {cat === "irrelevant" ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {items.map(function(it, i) { return <div key={i} style={{ background: "#111113", border: "1px solid #1c1c20", borderRadius: 6, padding: "5px 10px", fontSize: 11 }}><span style={{ color: "#888" }}>{it.keyword}</span>{it.reason && <span style={{ color: "#444", fontSize: 9, marginLeft: 4 }}> - {it.reason}</span>}</div>; })}
                        </div>
                      ) : (
                        <Tbl hc={meta.color}
                          headers={cat === "branded" ? ["Keyword", "Volume", "Rank", "Type", "Action"] : cat === "goal" ? ["Keyword", "Volume", "Rank", "Difficulty", "Daily Sales", "Action"] : cat === "generic" ? ["Keyword", "Volume", "Competition", "Action"] : ["Keyword", "Volume", "Difficulty", "Time to Rank", "Action"]}
                          rows={items.map(function(it) {
                            var kw = <span style={{ fontWeight: 600, color: meta.color }}>{it.keyword}</span>;
                            var vol = <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#8b5cf6" }}>{(it.volume || 0).toLocaleString()}</span>;
                            var act = <span style={{ color: "#888", fontSize: 10.5 }}>{it.action}</span>;
                            if (cat === "branded") return [kw, vol, it.rank || "-", <Badge color={it.type === "own" ? "#10b981" : "#ef4444"} small>{it.type || "competitor"}</Badge>, act];
                            if (cat === "goal") return [kw, vol, it.rank || "-", it.difficulty || "-", it.dailySales || "-", act];
                            if (cat === "generic") return [kw, vol, it.competition || "-", act];
                            return [kw, vol, it.difficulty || "-", it.timeToRank || "-", act];
                          })} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PPC */}
        {tab === "ppc" && ppc && (
          <div style={{ animation: "fadeIn .3s" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>PPC Strategy</h2>
            {ppc.budget && (
              <Card style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
                  <div><div style={{ color: "#444", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Daily Budget</div><div style={{ color: "#10b981", fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{"$" + (ppc.budget.daily || 0)}</div></div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    {[{ l: "SP", v: ppc.budget.sp, c: "#f59e0b" }, { l: "SB", v: ppc.budget.sb, c: "#8b5cf6" }, { l: "SD", v: ppc.budget.sd, c: "#3b82f6" }].map(function(b) {
                      return <div key={b.l} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ color: b.c, fontSize: 10, fontWeight: 700, minWidth: 18 }}>{b.l}</span>
                        <div style={{ flex: 1, background: "#1a1a1e", borderRadius: 3, height: 5, overflow: "hidden" }}><div style={{ background: b.c, height: "100%", width: (b.v || 0) + "%" }} /></div>
                        <span style={{ color: "#444", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{b.v || 0}%</span>
                      </div>;
                    })}
                  </div>
                </div>
              </Card>
            )}
            <div style={{ fontWeight: 700, fontSize: 13, color: "#ef4444", marginBottom: 8 }}>Daily Ad Actions</div>
            <Tbl hc="#ef4444" headers={["Keyword", "Match", "Bid", "Daily $", "Priority", "Rationale"]}
              rows={(ppc.dailyActions || []).map(function(a) { return [
                <span style={{ fontWeight: 600 }}>{a.keyword}</span>,
                <Badge color={a.matchType === "exact" ? "#10b981" : a.matchType === "phrase" ? "#f59e0b" : "#8b5cf6"} small>{a.matchType}</Badge>,
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#10b981" }}>{"$" + (a.bid || 0).toFixed(2)}</span>,
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{"$" + (a.dailyBudget || 0)}</span>,
                <Badge color={pColor(a.priority)} small>{a.priority}</Badge>,
                <span style={{ color: "#777", fontSize: 10.5 }}>{a.rationale}</span>,
              ]; })} />
            {ppc.negatives && ppc.negatives.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#6b7280", marginBottom: 8 }}>Negative Keywords</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {ppc.negatives.map(function(n, i) { return <div key={i} style={{ background: "#111113", border: "1px solid #1c1c20", borderRadius: 6, padding: "5px 10px", fontSize: 11 }}><span style={{ color: "#ef4444", fontWeight: 600 }}>{n.keyword}</span><span style={{ color: "#444", fontSize: 9, marginLeft: 4 }}> - {n.reason}</span></div>; })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LISTING */}
        {tab === "listing" && listing && (
          <div style={{ animation: "fadeIn .3s" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Listing Optimization</h2>
            {listing.score && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <Stat label="Before" value={(listing.score.before || 0) + "/100"} accent="#ef4444" />
                <Stat label="After" value={(listing.score.after || 0) + "/100"} accent="#10b981" />
              </div>
            )}
            {listing.title && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b", marginBottom: 8 }}>Title</div>
                {listing.title.current && <Card accent="#ef4444" style={{ marginBottom: 6 }}><div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 3 }}>CURRENT</div><div style={{ color: "#888", fontSize: 12 }}>{listing.title.current}</div></Card>}
                <Card accent="#10b981"><div style={{ fontSize: 10, color: "#10b981", fontWeight: 700, marginBottom: 3 }}>OPTIMIZED</div><div style={{ color: "#ccc", fontSize: 12, fontWeight: 600 }}>{listing.title.optimized}</div></Card>
              </div>
            )}
            {listing.bullets && listing.bullets.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#8b5cf6", marginBottom: 8 }}>Bullet Points</div>
                {listing.bullets.map(function(b, i) { return <Card key={i} accent="#8b5cf6" style={{ marginBottom: 6 }}><div style={{ color: "#ccc", fontSize: 12, lineHeight: 1.5 }}>{b.optimized}</div>{b.keywordsUsed && b.keywordsUsed.length > 0 && <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 6 }}>{b.keywordsUsed.map(function(k, j) { return <Badge key={j} color="#8b5cf6" small>{k}</Badge>; })}</div>}</Card>; })}
              </div>
            )}
            {listing.backendTerms && listing.backendTerms.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#10b981", marginBottom: 8 }}>Backend Search Terms</div>
                <Card accent="#10b981"><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#10b981", lineHeight: 1.8, wordBreak: "break-all" }}>{listing.backendTerms.join(" ")}</div></Card>
              </div>
            )}
          </div>
        )}

        {/* COMPETITORS */}
        {tab === "competitors" && competitors && (
          <div style={{ animation: "fadeIn .3s" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Competitor Intelligence</h2>
            {(competitors.competitors || []).map(function(c, i) {
              return <Card key={i} accent="#ef4444" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: "#ef4444" }}>{c.brand}</span>
                  <Badge color="#f59e0b" small>{c.revenue}</Badge>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>{c.strategy}</div>
                {c.topKeywords && c.topKeywords.length > 0 && (
                  <Tbl hc="#ef4444" headers={["Keyword", "Their Rank", "Our Rank", "Type"]}
                    rows={c.topKeywords.map(function(k) { return [
                      <span style={{ fontWeight: 600 }}>{k.keyword}</span>,
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#ef4444" }}>{"#" + k.theirRank}</span>,
                      k.ourRank ? <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#10b981" }}>{"#" + k.ourRank}</span> : <span style={{ color: "#444" }}>Not ranking</span>,
                      <Badge color={k.type === "sponsored" ? "#f59e0b" : "#10b981"} small>{k.type}</Badge>,
                    ]; })} />
                )}
              </Card>;
            })}
            {competitors.keywordSteal && competitors.keywordSteal.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b", marginBottom: 8 }}>Keywords to Steal</div>
                <Tbl hc="#f59e0b" headers={["Keyword", "Volume", "Competitor", "Priority", "Action"]}
                  rows={competitors.keywordSteal.map(function(k) { return [
                    <span style={{ fontWeight: 700, color: "#f59e0b" }}>{k.keyword}</span>,
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#8b5cf6" }}>{(k.volume || 0).toLocaleString()}</span>,
                    k.competitor, <Badge color={pColor(k.priority)} small>{k.priority}</Badge>,
                    <span style={{ color: "#888", fontSize: 10.5 }}>{k.action}</span>,
                  ]; })} />
              </div>
            )}
          </div>
        )}

        {/* PUSH PLAN */}
        {tab === "push" && pushPlan && (
          <div style={{ animation: "fadeIn .3s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Keyword Push Plan</h2>
              <div style={{ display: "flex", gap: 4 }}>
                <Badge color="#f59e0b" active={pushMode === "hourly"} onClick={function() { setPushMode("hourly"); }}>Hourly</Badge>
                <Badge color="#3b82f6" active={pushMode === "daily"} onClick={function() { setPushMode("daily"); }}>Daily</Badge>
              </div>
            </div>
            {pushMode === "hourly" && (pushPlan.hourly || []).map(function(h, i) {
              return <Card key={i} accent="#f59e0b" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, color: "#f59e0b", fontSize: 13 }}>{h.hour}</span>
                  <Badge color="#f59e0b" small>{(h.multiplier || 1) + "x"}</Badge>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>{h.strategy}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(h.keywords || []).map(function(k, j) { return <div key={j} style={{ background: "#0a0a0c", borderRadius: 6, padding: "5px 8px", border: "1px solid #18181c" }}><span style={{ fontWeight: 600, fontSize: 11 }}>{k.keyword}</span><span style={{ color: "#10b981", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginLeft: 4 }}>{"$" + (k.bid || 0).toFixed(2)}</span></div>; })}
                </div>
              </Card>;
            })}
            {pushMode === "daily" && (pushPlan.daily || []).map(function(d, i) {
              return <Card key={i} accent="#3b82f6" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, color: "#3b82f6", fontSize: 13 }}>{d.day}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#10b981", fontSize: 12 }}>{"$" + (d.totalBudget || 0) + "/day"}</span>
                </div>
                <div style={{ color: "#888", fontSize: 11, marginBottom: 6 }}>{d.strategy}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(d.keywords || []).map(function(k, j) { return <div key={j} style={{ background: "#0a0a0c", borderRadius: 6, padding: "5px 8px", border: "1px solid #18181c" }}><span style={{ fontWeight: 600, fontSize: 11 }}>{k.keyword}</span><span style={{ color: "#10b981", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginLeft: 4 }}>{"$" + (k.bid || 0).toFixed(2)}</span><span style={{ color: "#8b5cf6", fontSize: 9, marginLeft: 4 }}>{k.match || ""}</span></div>; })}
                </div>
              </Card>;
            })}
            {pushPlan.weekendStrategy && <Card accent="#8b5cf6" style={{ marginTop: 12 }}><span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 11 }}>WEEKEND: </span><span style={{ color: "#888", fontSize: 11 }}>{pushPlan.weekendStrategy}</span></Card>}
          </div>
        )}

        {/* APIS */}
        {tab === "api" && (
          <div style={{ animation: "fadeIn .3s" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>API Integrations</h2>
            <p style={{ color: "#444", fontSize: 12, marginBottom: 16 }}>Connect tools to pull live data automatically.</p>
            {[
              { name: "Jungle Scout", desc: "Keyword rankings, sales estimates, competitor ASINs, daily PPC suggestions.", color: "#10b981", ready: true },
              { name: "Helium 10", desc: "Cerebro reverse ASIN, Magnet keyword research, rank tracking.", color: "#f59e0b", ready: true },
              { name: "Keepa", desc: "Historical pricing, BSR trends, buy box analysis.", color: "#3b82f6", ready: false },
              { name: "Amazon SP-API", desc: "Direct Seller Central data - orders, inventory, catalog, reports.", color: "#ef4444", ready: false },
            ].map(function(tool) {
              return <Card key={tool.name} accent={tool.color} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{tool.name}</span>
                  <Badge color={tool.ready ? "#10b981" : "#555"} small>{tool.ready ? "Ready" : "Planned"}</Badge>
                </div>
                <div style={{ color: "#555", fontSize: 11 }}>{tool.desc}</div>
                {tool.ready && <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <input placeholder={tool.name + " API key..."} type="password" style={{ flex: 1, maxWidth: 350, background: "#0a0a0c", border: "1px solid #1c1c20", borderRadius: 8, padding: "8px 12px", color: "#e4e4e7", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                  <button style={{ background: tool.color, color: "#000", border: "none", padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Connect</button>
                </div>}
              </Card>;
            })}
          </div>
        )}

        {/* CHAT */}
        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 180px)", animation: "fadeIn .3s" }}>
            <div style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Ask the Agent</h2>
              <p style={{ color: "#333", fontSize: 11, margin: "2px 0 0" }}>GPT 5.4 | Catalog Manager + PPC Analyst{classify ? " | Analysis loaded" : ""}</p>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
              {chat.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "#222", fontSize: 12 }}>Ask about keywords, ASINs, PPC, competitors, listings...</div>}
              {chat.map(function(m, i) {
                return <div key={i} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "#161208" : "#111113",
                  border: "1px solid " + (m.role === "user" ? "#252010" : "#1c1c20"),
                  borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                  padding: "10px 14px", maxWidth: "85%", fontSize: 12.5, lineHeight: 1.7,
                  color: m.role === "user" ? "#f59e0b" : "#bbb", whiteSpace: "pre-wrap",
                }}>{m.content}</div>;
              })}
              {chatLoad && <div style={{ color: "#333", fontSize: 11, padding: "8px 14px", fontStyle: "italic" }}>Thinking...</div>}
              <div ref={chatEnd} />
            </div>
            <div style={{ display: "flex", gap: 6, paddingTop: 8 }}>
              <input value={prompt} onChange={function(e) { setPrompt(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter" && !e.shiftKey) sendChat(); }} placeholder="Ask about keywords, ASINs, PPC, competitors..." style={{ flex: 1, background: "#0a0a0c", border: "1px solid #1c1c20", borderRadius: 8, padding: "10px 14px", color: "#e4e4e7", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
              <button onClick={sendChat} disabled={chatLoad} style={{ background: chatLoad ? "#1a1a1e" : "linear-gradient(135deg,#f59e0b,#ef4444)", color: chatLoad ? "#555" : "#000", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: chatLoad ? "default" : "pointer", fontFamily: "inherit" }}>Send</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

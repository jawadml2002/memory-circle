"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const PIN_COUNT = 240;
const INTERVALS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];

// ── Design tokens ─────────────────────────────────────────────────────────────
// Dark theme: deep navy backgrounds, gold accent, white text
// Light panels: pure white, dark text, gold accents
const C = {
  // Backgrounds
  bgDeep:    "#0a0c14",   // deepest background
  bgDark:    "#111827",   // dark cards / headers
  bgPanel:   "#1a2235",   // slightly lighter panels
  bgLight:   "#ffffff",   // white panels (playback controls)
  bgSubtle:  "#f4f6fa",   // subtle light grey

  // Accent — warm gold
  gold:      "#c9a84c",
  goldBright:"#f0c060",
  goldDim:   "rgba(201,168,76,0.15)",
  goldBorder:"rgba(201,168,76,0.35)",

  // Text
  textWhite: "#ffffff",
  textLight: "#e2e8f0",
  textMuted: "rgba(255,255,255,0.45)",
  textDark:  "#0f172a",
  textGrey:  "#64748b",

  // Status
  red:       "#e53e3e",
  green:     "#22c55e",
  greenDim:  "rgba(34,197,94,0.12)",

  // Borders
  borderDark: "rgba(255,255,255,0.08)",
  borderLight:"#e2e8f0",
};

// Reusable button styles
const BTN = {
  // Primary gold button — used for main actions
  gold: {
    background: `linear-gradient(135deg, ${C.goldBright}, ${C.gold})`,
    color: "#1a1200",
    border: "none",
    borderRadius: 14,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: `0 4px 20px rgba(201,168,76,0.35)`,
  },
  // Dark button with gold border — secondary actions on dark bg
  outline: {
    background: "transparent",
    color: C.goldBright,
    border: `1.5px solid ${C.goldBorder}`,
    borderRadius: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  // Ghost dark — tertiary on dark bg
  ghost: {
    background: "rgba(255,255,255,0.07)",
    color: C.textLight,
    border: `1px solid ${C.borderDark}`,
    borderRadius: 10,
    fontWeight: 500,
    cursor: "pointer",
  },
  // Light button — used in white panels
  light: {
    background: C.bgSubtle,
    color: C.textDark,
    border: `1.5px solid ${C.borderLight}`,
    borderRadius: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  // Danger
  danger: {
    background: "rgba(229,62,62,0.1)",
    color: C.red,
    border: "1.5px solid rgba(229,62,62,0.3)",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer",
  },
};

function useMobileMeta() {
  useEffect(() => {
    let meta = document.querySelector("meta[name=viewport]");
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      body { margin: 0; overscroll-behavior: none; background: ${C.bgDeep}; }
      input, select, textarea { font-size: 16px !important; }
      button { touch-action: manipulation; font-family: inherit; }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
      @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    `;
    document.head.appendChild(style);
    return () => { try { document.head.removeChild(style); } catch {} };
  }, []);
}

function pinPositions(count, radius, cx, cy) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return pts;
}

function parseSequence(text) {
  const lines = text.split(/\r?\n/);
  const seq = [], errors = [];
  lines.forEach((raw, idx) => {
    let line = raw.trim();
    if (!line) return;
    line = line.replace(/^[-*•]\s*/, "");
    line = line.replace(/^step\s*\d+\s*[:.)-]?\s*/i, "");
    line = line.replace(/pin/gi, " ");
    const nums = (line.match(/\d+/g) || []).map(Number);
    if (nums.length < 2) { errors.push({ line: idx+1, reason: "Need two pin numbers" }); return; }
    if (nums.length > 2) { errors.push({ line: idx+1, reason: "Too many numbers" }); return; }
    const [a, b] = nums;
    if (a < 1 || a > PIN_COUNT || b < 1 || b > PIN_COUNT) { errors.push({ line: idx+1, reason: `Pins must be 1-${PIN_COUNT}` }); return; }
    seq.push([a, b]);
  });
  return { seq, errors };
}

function timeAgo(t) {
  const d = Date.now() - new Date(t).getTime(), day = 86400000;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < day) return Math.floor(d / 3600000) + "h ago";
  if (d < day * 2) return "yesterday";
  return Math.floor(d / day) + "d ago";
}

function copyText(text) {
  try {
    const el = document.createElement("textarea");
    el.value = text; el.style.cssText = "position:absolute;left:-9999px;top:0";
    document.body.appendChild(el); el.select(); document.execCommand("copy");
    document.body.removeChild(el); return true;
  } catch { return false; }
}

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Board canvas — always white circle, light black threads ───────────────────
// No pan/zoom. Board fills the container as a perfect square.
function Board({ sequence, step, sz: szProp }) {
  const baseRef = useRef(null), overRef = useRef(null);
  const sz = szProp || 300;
  const committedTo = useRef(0), lastSzStep = useRef("");
  const DPR = Math.min(typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1, 2);
  const L = 1000, cx = 500, cy = 500, R = 474;
  const pins = useMemo(() => pinPositions(PIN_COUNT, R, cx, cy), []);

  const applyXform = useCallback((ctx) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const scale = sz / L;
    ctx.translate(sz / 2, sz / 2);
    ctx.scale(scale, scale); ctx.translate(-cx, -cy);
  }, [DPR, sz]);

  // Board always white with subtle shadow border
  const paintBoard = useCallback((ctx) => {
    // Outer glow
    ctx.shadowColor = "rgba(201,168,76,0.12)";
    ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#f8f8f8"; ctx.fill();
    ctx.shadowBlur = 0;
    // White circle
    ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    // Thin border
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 1.5; ctx.stroke();
  }, []);

  const repaintBase = useCallback((upto) => {
    const c = baseRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    applyXform(ctx); paintBoard(ctx);
    // Each thread drawn individually so overlaps compound and darken — forming the picture
    ctx.lineWidth = 0.8; ctx.lineCap = "round";
    for (let i = 0; i < upto; i++) {
      const [a, b] = sequence[i];
      ctx.strokeStyle = "rgba(20,20,35,0.18)";
      ctx.beginPath();
      ctx.moveTo(pins[a-1][0], pins[a-1][1]); ctx.lineTo(pins[b-1][0], pins[b-1][1]);
      ctx.stroke();
    }
    committedTo.current = upto;
  }, [applyXform, paintBoard, pins, sequence]);

  const appendBase = useCallback((from, to) => {
    const c = baseRef.current; if (!c) return;
    const ctx = c.getContext("2d"); applyXform(ctx);
    // Each thread drawn individually so overlaps compound and darken
    ctx.lineWidth = 0.8; ctx.lineCap = "round";
    for (let i = from; i < to; i++) {
      const [a, b] = sequence[i];
      ctx.strokeStyle = "rgba(20,20,35,0.18)";
      ctx.beginPath();
      ctx.moveTo(pins[a-1][0], pins[a-1][1]); ctx.lineTo(pins[b-1][0], pins[b-1][1]);
      ctx.stroke();
    }
    committedTo.current = to;
  }, [applyXform, pins, sequence]);

  useEffect(() => {
    const key = `${sz}|${step}`;
    if (key === lastSzStep.current && step === committedTo.current) return;
    const szChanged = sz !== parseInt(lastSzStep.current);
    lastSzStep.current = `${sz}`;
    if (szChanged) { committedTo.current = 0; repaintBase(step); return; }
    if (step > committedTo.current) appendBase(committedTo.current, step);
    else if (step < committedTo.current) repaintBase(step);
  }, [step, sz, repaintBase, appendBase]);

  useEffect(() => {
    const c = overRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    applyXform(ctx);
    const scale = sz / L;
    const cur = (step > 0 && step <= sequence.length) ? sequence[step-1] : null;
    // Current thread — gold glow
    if (cur) {
      const pa = pins[cur[0]-1], pb = pins[cur[1]-1];
      ctx.lineCap = "round";
      ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
      ctx.lineWidth = 2.5; ctx.strokeStyle = C.gold;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const active = new Set(cur ? [cur[0], cur[1]] : []);
    // Pins — only show active pin labels always; others only when zoomed
    for (let i = 0; i < PIN_COUNT; i++) {
      const [x, y] = pins[i]; const on = active.has(i+1);
      ctx.beginPath(); ctx.arc(x, y, on ? 5.5 : 2.2, 0, Math.PI * 2);
      if (on) { ctx.shadowColor = C.gold; ctx.shadowBlur = 12; ctx.fillStyle = C.gold; }
      else { ctx.fillStyle = "rgba(20,20,40,0.4)"; }
      ctx.fill(); ctx.shadowBlur = 0;
    }
    // Always show active pin labels
    for (let i = 0; i < PIN_COUNT; i++) {
      const on = active.has(i+1); if (!on) continue;
      const ang = (i / PIN_COUNT) * Math.PI * 2 - Math.PI / 2;
      const lx = cx + Math.cos(ang) * (R + 14), ly = cy + Math.sin(ang) * (R + 14);
      ctx.save(); ctx.translate(lx, ly); ctx.scale(1/scale, 1/scale);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = C.gold;
      ctx.font = `700 11px ui-monospace,monospace`;
      ctx.fillText(String(i+1), 0, 0); ctx.restore();
    }
  }, [step, sz, applyXform, pins, sequence]);

  const CA = { width: sz * DPR, height: sz * DPR, style: { width: sz, height: sz, position: "absolute", top: 0, left: 0 } };
  return (
    <div style={{ width: sz, height: sz, position: "relative", borderRadius: "50%", overflow: "hidden" }}>
      <canvas ref={baseRef} {...CA} />
      <canvas ref={overRef} {...CA} style={{ ...CA.style }} />
    </div>
  );
}

function MiniBoard({ seq }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"), S = 200, R = 90, cxc = 100, cyc = 100;
    ctx.clearRect(0, 0, S, S);
    // White circle
    ctx.beginPath(); ctx.arc(cxc, cyc, R, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.07)"; ctx.lineWidth = 1; ctx.stroke();
    if (!seq || !seq.length) return;
    const pts = pinPositions(PIN_COUNT, R - 4, cxc, cyc);
    // Individual strokes so overlaps compound and form the picture
    ctx.lineWidth = 0.5; ctx.lineCap = "round";
    const max = Math.min(seq.length, 3000);
    for (let i = 0; i < max; i++) {
      const [a, b] = seq[i];
      ctx.strokeStyle = "rgba(20,20,35,0.18)";
      ctx.beginPath();
      ctx.moveTo(pts[a-1][0], pts[a-1][1]); ctx.lineTo(pts[b-1][0], pts[b-1][1]);
      ctx.stroke();
    }
  }, [seq]);
  return <canvas ref={ref} width={200} height={200} style={{ width: "100%", height: "100%", display: "block" }} />;
}

// ── Logo mark ─────────────────────────────────────────────────────────────────
function Logo({ size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldBright})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1200", fontSize: size * 0.45, fontWeight: 900, flexShrink: 0, boxShadow: `0 2px 12px rgba(201,168,76,0.4)` }}>◉</div>
  );
}

// ── Public home ────────────────────────────────────────────────────────────────
function PublicHome({ onJoined, onOwnerAccess }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const logoTaps = useRef(0), tapTimer = useRef(null);

  const join = async () => {
    if (!code.trim()) { setErr("Please enter a project code."); return; }
    setErr(""); setLoading(true);
    const res = await api("/api/join", "POST", { code });
    setLoading(false);
    if (res.error) { setErr(res.error); return; }
    onJoined(res.project);
  };

  const handleLogoTap = () => {
    logoTaps.current++;
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { logoTaps.current = 0; }, 2000);
    if (logoTaps.current >= 7) { logoTaps.current = 0; onOwnerAccess(); }
  };

  useEffect(() => {
    const h = (e) => { if (e.ctrlKey && e.shiftKey && e.key === "O") { e.preventDefault(); onOwnerAccess(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onOwnerAccess]);

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${C.bgDeep} 0%, #0d1525 100%)`, display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "0 20px", height: 60, display: "flex", alignItems: "center", borderBottom: `1px solid ${C.borderDark}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }} onClick={handleLogoTap}>
          <Logo size={36} />
          <span style={{ fontWeight: 700, fontSize: 17, color: C.textWhite, letterSpacing: "-0.01em" }}>The Memory Circle</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 48px", animation: "fadeIn 0.4s ease" }}>
        <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
          {/* Decorative art */}
          <div style={{ marginBottom: 32, display: "flex", justifyContent: "center" }}>
            <PublicArt />
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.textWhite, margin: "0 0 10px", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
            Join a shared<br />string art project
          </h1>
          <p style={{ fontSize: 15, color: C.textMuted, margin: "0 0 32px", lineHeight: 1.7 }}>
            Enter the code you received to follow along step by step.
          </p>

          {/* Card */}
          <div style={{ background: C.bgPanel, borderRadius: 24, padding: "28px 24px", border: `1px solid ${C.borderDark}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.gold, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Project code
            </label>
            <input
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && join()}
              placeholder="SART-XXXX-XXXX"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              style={{ width: "100%", padding: "18px 20px", fontSize: 22, fontFamily: "ui-monospace,monospace", fontWeight: 700, letterSpacing: "0.12em", background: "rgba(255,255,255,0.05)", border: `2px solid ${err ? "rgba(229,62,62,0.6)" : C.borderDark}`, borderRadius: 14, outline: "none", boxSizing: "border-box", marginBottom: 14, color: C.textWhite, transition: "border-color .2s" }}
              onFocus={e => { if (!err) e.target.style.borderColor = C.goldBorder; }}
              onBlur={e => { if (!err) e.target.style.borderColor = C.borderDark; }}
            />
            {err && (
              <div style={{ background: "rgba(229,62,62,0.1)", border: "1px solid rgba(229,62,62,0.3)", color: "#fc8181", borderRadius: 10, padding: "12px 16px", fontSize: 14, marginBottom: 14, lineHeight: 1.4 }}>
                {err}
              </div>
            )}
            <button
              onClick={join} disabled={loading}
              style={{ ...BTN.gold, width: "100%", padding: "18px 0", fontSize: 17, borderRadius: 14, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Opening…" : "Join Project →"}
            </button>
          </div>

          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", marginTop: 24, lineHeight: 1.5 }}>
            Don&apos;t have a code? Ask the project owner to share one with you.
          </p>
        </div>
      </div>
    </div>
  );
}

function PublicArt() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"), S = 180, R = 76, cx = 90, cy = 90;
    ctx.clearRect(0, 0, S, S);
    // Glow ring
    ctx.shadowColor = `rgba(201,168,76,0.25)`; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(201,168,76,0.3)"; ctx.lineWidth = 2; ctx.stroke();
    const pts = pinPositions(80, R - 5, cx, cy);
    const seq = []; let p = 0;
    for (let k = 0; k < 320; k++) { const n = (p + 31) % 80; seq.push([p, n]); p = n; }
    let i = 0; let raf;
    const tick = () => {
      for (let s = 0; s < 2 && i < seq.length; s++, i++) {
        ctx.strokeStyle = "rgba(30,30,50,0.2)"; ctx.lineWidth = 0.6; ctx.beginPath();
        ctx.moveTo(pts[seq[i][0]][0], pts[seq[i][0]][1]); ctx.lineTo(pts[seq[i][1]][0], pts[seq[i][1]][1]); ctx.stroke();
      }
      if (i < seq.length) raf = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={180} height={180} style={{ borderRadius: "50%", boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${C.goldBorder}` }} />;
}

// ── Public viewer — full screen, no scroll, app-like layout ─────────────────
function PublicViewer({ project, onBack }) {
  const seq = project.sequence || [];
  const total = seq.length;
  const [step, setStep] = useState(project.step || 0);
  const [playing, setPlaying] = useState(false);
  const [intervalSec, setIntervalSec] = useState(project.interval_sec || 2);
  const [jump, setJump] = useState("");
  const pct = total ? ((step / total) * 100).toFixed(1) : "0.0";
  const cur = (step > 0 && step <= total) ? seq[step-1] : null;
  const stepRef = useRef(step); // always holds latest step for cleanup
  const saveTimer = useRef(null);

  // Keep stepRef in sync
  useEffect(() => { stepRef.current = step; }, [step]);

  // Save step to DB — debounced so it doesn't fire on every single tap
  const saveStep = useCallback((s) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api(`/api/projects/${project.id}/progress`, "PATCH", { step: s, last_opened: new Date().toISOString() });
    }, 800);
  }, [project.id]);

  // Save whenever step changes
  useEffect(() => { saveStep(step); }, [step, saveStep]);

  // Save immediately when leaving (Back button or page unload)
  const handleBack = useCallback(() => {
    clearTimeout(saveTimer.current);
    api(`/api/projects/${project.id}/progress`, "PATCH", { step: stepRef.current, last_opened: new Date().toISOString() });
    onBack();
  }, [project.id, onBack]);

  useEffect(() => {
    const onUnload = () => {
      api(`/api/projects/${project.id}/progress`, "PATCH", { step: stepRef.current });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      clearTimeout(saveTimer.current);
    };
  }, [project.id]);

  // Board size: compute once from window, stable square that fills available width
  const [boardSz, setBoardSz] = useState(() => {
    if (typeof window === "undefined") return 300;
    return Math.min(window.innerWidth, window.innerHeight * 0.52) - 24;
  });

  useEffect(() => {
    const update = () => {
      setBoardSz(Math.min(window.innerWidth, window.innerHeight * 0.52) - 24);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (step >= total) { setPlaying(false); return; }
    const id = setInterval(() => {
      let end = false;
      setStep(s => { const n = Math.min(total, s + 1); if (n >= total) end = true; return n; });
      if (end) setPlaying(false);
    }, intervalSec * 1000);
    return () => clearInterval(id);
  }, [playing, intervalSec, total]);

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); setStep(s => Math.max(0, s-1)); }
      else if (e.code === "ArrowRight") { e.preventDefault(); setStep(s => Math.min(total, s+1)); }
      else if (e.code === "Home") { e.preventDefault(); setPlaying(false); setStep(0); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [total]);

  // Destination pin = where to wind next (cur[1])
  // Next-up pin = the destination of the step after current
  const destPin = cur ? cur[1] : null;
  const nextStep = (step < total) ? seq[step] : null;
  const nextPin = nextStep ? nextStep[1] : null;

  const H = {
    topBar: 52,
    board: boardSz,
    progressBar: 44,
    pinStrip: 68,
    transport: 88,
  };

  return (
    <div style={{
      height: "100dvh", width: "100vw",
      display: "flex", flexDirection: "column",
      background: C.bgDeep, fontFamily: "system-ui,sans-serif",
      overflow: "hidden",
    }}>

      {/* ── Top bar ── */}
      <div style={{
        height: H.topBar, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px",
        background: "rgba(0,0,0,0.3)",
      }}>
        <button onClick={handleBack} style={{
          background: "rgba(255,255,255,0.1)", border: `1px solid ${C.borderDark}`,
          color: C.textWhite, borderRadius: 10, padding: "8px 16px",
          fontSize: 15, fontWeight: 600, cursor: "pointer",
        }}>← Back</button>
        <span style={{
          fontWeight: 700, fontSize: 16, color: C.textWhite,
          flex: 1, textAlign: "center", margin: "0 12px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{project.name}</span>
        <span style={{
          fontSize: 11, background: C.goldDim, color: C.gold,
          border: `1px solid ${C.goldBorder}`, borderRadius: 8,
          padding: "4px 10px", fontWeight: 700,
        }}>SHARED</span>
      </div>

      {/* ── Board — centred, fixed square ── */}
      <div style={{
        flexShrink: 0, height: boardSz + 16,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "8px 0",
      }}>
        <Board sequence={seq} step={step} sz={boardSz} />
      </div>

      {/* ── Progress bar + step counter ── */}
      <div style={{ flexShrink: 0, padding: "0 20px", height: H.progressBar, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
        {/* Track */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.goldBright})`, borderRadius: 3, transition: "width .15s", boxShadow: `0 0 6px rgba(201,168,76,0.5)` }} />
          </div>
          {/* Fast forward to end */}
          <button onClick={() => setStep(total)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 18, cursor: "pointer", padding: "0 4px" }}>⏭</button>
        </div>
        {/* Step counter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "monospace", fontSize: 14, color: C.gold, fontWeight: 700 }}>
            {step.toLocaleString()} / {total.toLocaleString()}
          </span>
          <span style={{ fontFamily: "monospace", fontSize: 13, color: C.textMuted }}>{pct}%</span>
        </div>
      </div>

      {/* ── Pin display — centered, shows destination pin large + next pin small ── */}
      <div style={{
        flexShrink: 0, height: H.pinStrip,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 16,
      }}>
        {destPin !== null ? (
          <>
            {/* Destination pin — large and centered */}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Go to pin</span>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: `linear-gradient(135deg, rgba(201,168,76,0.25), rgba(240,192,96,0.12))`,
                border: `2.5px solid ${C.gold}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "monospace", fontWeight: 900,
                fontSize: 30, color: C.goldBright,
                boxShadow: `0 0 24px rgba(201,168,76,0.35)`,
              }}>
                {destPin}
              </div>
            </div>
            {/* Next pin preview */}
            {nextPin !== null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>then</span>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: "rgba(255,255,255,0.06)",
                  border: `1.5px solid ${C.borderDark}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "monospace", fontWeight: 700,
                  fontSize: 20, color: C.textMuted,
                }}>
                  {nextPin}
                </div>
              </div>
            )}
          </>
        ) : (
          <span style={{ color: C.textMuted, fontSize: 14 }}>Press play to begin</span>
        )}
      </div>

      {/* ── Transport + interval + jump ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        justifyContent: "space-evenly", padding: "0 20px 12px",
      }}>
        {/* Main transport buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
          {/* Interval selector (left of transport) */}
          <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))}
            style={{
              background: "rgba(255,255,255,0.08)", border: `1px solid ${C.borderDark}`,
              color: C.textLight, borderRadius: 12, padding: "10px 10px",
              fontSize: 14, fontFamily: "monospace", outline: "none",
              width: 64, textAlign: "center",
            }}>
            {INTERVALS.map(s => <option key={s} value={s}>{s}s</option>)}
          </select>

          <button onClick={() => setStep(s => Math.max(0, s-1))}
            style={{ ...BTN.ghost, width: 54, height: 54, borderRadius: 16, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${C.borderDark}` }}>◀</button>

          <button onClick={() => setPlaying(p => !p)}
            style={{ ...BTN.gold, width: 72, height: 72, borderRadius: 22, fontSize: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {playing ? "⏸" : "▶"}
          </button>

          <button onClick={() => setStep(s => Math.min(total, s+1))}
            style={{ ...BTN.ghost, width: 54, height: 54, borderRadius: 16, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${C.borderDark}` }}>▶</button>

          {/* Restart */}
          <button onClick={() => { setPlaying(false); setStep(0); }}
            style={{ ...BTN.ghost, width: 54, height: 54, borderRadius: 16, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${C.borderDark}` }}>🔄</button>
        </div>

        {/* Jump to step */}
        <div style={{ display: "flex", gap: 10 }}>
          <input value={jump} onChange={e => setJump(e.target.value)}
            placeholder="Jump to step #" inputMode="numeric"
            onKeyDown={e => e.key === "Enter" && setStep(Math.max(0, Math.min(total, parseInt(jump,10)||0)))}
            style={{
              flex: 1, padding: "13px 16px",
              background: "rgba(255,255,255,0.07)", border: `1.5px solid ${C.borderDark}`,
              borderRadius: 12, fontSize: 15, fontFamily: "monospace",
              outline: "none", color: C.textWhite,
            }} />
          <button onClick={() => setStep(Math.max(0, Math.min(total, parseInt(jump,10)||0)))}
            style={{ ...BTN.gold, padding: "13px 22px", fontSize: 15, borderRadius: 12 }}>Go</button>
        </div>
      </div>
    </div>
  );
}


// ── Owner gate ─────────────────────────────────────────────────────────────────
function OwnerGate({ onPassed, onBack }) {
  const [phrase, setPhrase] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  const check = async () => {
    const res = await api("/api/auth/checkphrase", "POST", { passphrase: phrase });
    if (res.ok) { onPassed(phrase); return; }
    setErr("Incorrect passphrase."); setShake(true);
    setTimeout(() => setShake(false), 600); setPhrase("");
  };

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at center, #0d1525 0%, ${C.bgDeep} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400, background: C.bgPanel, borderRadius: 24, padding: "40px 32px", border: `1px solid ${C.borderDark}`, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", animation: shake ? "shake 0.5s ease" : "fadeIn 0.3s ease" }}>
        {/* Lock icon */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: C.goldDim, border: `2px solid ${C.goldBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 26 }}>🔒</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: C.textWhite, marginBottom: 8, letterSpacing: "-0.02em" }}>Private access</div>
          <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>Enter the owner passphrase to continue</div>
        </div>
        <input type="password" value={phrase} onChange={e => { setPhrase(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && check()} placeholder="Passphrase" autoFocus
          style={{ width: "100%", padding: "16px 20px", background: "rgba(255,255,255,0.06)", border: `2px solid ${err ? "rgba(229,62,62,0.5)" : C.borderDark}`, borderRadius: 14, color: C.textWhite, fontSize: 17, outline: "none", boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit", transition: "border-color .2s" }}
          onFocus={e => { if (!err) e.target.style.borderColor = C.goldBorder; }}
          onBlur={e => { if (!err) e.target.style.borderColor = C.borderDark; }}
        />
        {err && <div style={{ fontSize: 13, color: "#fc8181", marginBottom: 14, textAlign: "center" }}>{err}</div>}
        <button onClick={check} style={{ ...BTN.gold, width: "100%", padding: "16px 0", fontSize: 17, borderRadius: 14, marginBottom: 16 }}>
          Continue →
        </button>
        <div style={{ textAlign: "center" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>← Back to public site</button>
        </div>
      </div>
    </div>
  );
}

// ── Owner auth ─────────────────────────────────────────────────────────────────
function OwnerAuth({ passphrase, onAuthed, onBack }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState(""), [notice, setNotice] = useState("");

  const submit = async () => {
    setErr(""); setNotice("");
    if (mode === "forgot") { setNotice("If that email exists, a reset link is on its way."); return; }
    const res = await api("/api/auth/login", "POST", { email, password: pw, name, action: mode, passphrase });
    if (res.error) { setErr(res.error); return; }
    onAuthed({ email, name: res.name || name || email.split("@")[0] });
  };

  const inp = { width: "100%", padding: "14px 18px", background: "rgba(255,255,255,0.06)", border: `1.5px solid ${C.borderDark}`, borderRadius: 12, color: C.textWhite, fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 14, fontFamily: "inherit" };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, color: C.gold, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" };

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at center, #0d1525 0%, ${C.bgDeep} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440, background: C.bgPanel, borderRadius: 24, padding: "36px 28px", border: `1px solid ${C.borderDark}`, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", animation: "fadeIn 0.3s ease" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <Logo size={44} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: C.textWhite, letterSpacing: "-0.01em" }}>Owner Dashboard</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>The Memory Circle · Private access</div>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4, marginBottom: 24 }}>
          {["login","register"].map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: mode === m ? `linear-gradient(135deg, ${C.goldBright}, ${C.gold})` : "transparent", color: mode === m ? "#1a1200" : C.textMuted, fontWeight: mode === m ? 700 : 500, cursor: "pointer", fontSize: 14, transition: "all .2s" }}>
              {m === "login" ? "Log in" : "Create account"}
            </button>
          ))}
        </div>

        {mode === "register" && <><label style={lbl}>Name</label><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></>}
        <label style={lbl}>Email</label>
        <input style={inp} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="your@email.com" type="email" />
        {mode !== "forgot" && <><label style={lbl}>Password</label><input style={inp} type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="••••••••" /></>}

        {err && <div style={{ background: "rgba(229,62,62,0.1)", border: "1px solid rgba(229,62,62,0.3)", color: "#fc8181", borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 14 }}>{err}</div>}
        {notice && <div style={{ background: C.greenDim, border: `1px solid rgba(34,197,94,0.3)`, color: C.green, borderRadius: 10, padding: "12px 16px", fontSize: 13, marginBottom: 14 }}>{notice}</div>}

        <button onClick={submit} style={{ ...BTN.gold, width: "100%", padding: "15px 0", fontSize: 16, borderRadius: 14, marginBottom: 16 }}>
          {mode === "login" ? "Log in to dashboard" : mode === "register" ? "Create account" : "Send reset link"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>← Back</button>
          <button onClick={() => setMode("forgot")} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13 }}>Forgot password?</button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function Dashboard({ user, onOpen, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [shareFor, setShareFor] = useState(null);

  const load = async () => {
    setLoading(true);
    const res = await api("/api/projects");
    if (res.projects) setProjects(res.projects);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const res = await api("/api/projects", "POST", { name: "Untitled project" });
    if (res.project) onOpen(res.project);
  };
  const del = async (p) => { await api(`/api/projects/${p.id}`, "DELETE"); setConfirmDel(null); load(); };
  const dup = async (p) => {
    const res = await api("/api/projects", "POST", { name: p.name + " copy" });
    if (res.project) { await api(`/api/projects/${res.project.id}`, "PATCH", { sequence: p.sequence, step: 0, interval_sec: p.interval_sec }); load(); }
  };

  const filtered = q ? projects.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : projects;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${C.bgDeep} 0%, #0d1525 100%)`, fontFamily: "system-ui,sans-serif" }}>
      {/* Nav */}
      <div style={{ background: C.bgDark, borderBottom: `1px solid ${C.borderDark}`, padding: "0 20px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={32} />
          <div>
            <span style={{ fontWeight: 700, fontSize: 15, color: C.textWhite }}>The Memory Circle</span>
            <span style={{ marginLeft: 10, fontSize: 10, background: C.goldDim, color: C.gold, border: `1px solid ${C.goldBorder}`, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>OWNER</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.textMuted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</span>
          <button onClick={async () => { await api("/api/auth/logout", "POST"); onLogout(); }}
            style={{ ...BTN.ghost, padding: "7px 14px", fontSize: 13 }}>Log out</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 16px 80px", animation: "fadeIn 0.3s ease" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.textWhite, letterSpacing: "-0.02em" }}>Your projects</h1>
            <p style={{ margin: "4px 0 0", color: C.textMuted, fontSize: 13 }}>{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textMuted, fontSize: 15 }}>⌕</span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects"
                style={{ padding: "11px 14px 11px 36px", background: "rgba(255,255,255,0.06)", border: `1.5px solid ${C.borderDark}`, borderRadius: 12, fontSize: 14, outline: "none", color: C.textWhite, width: "100%", boxSizing: "border-box" }} />
            </div>
            <button onClick={create} style={{ ...BTN.gold, padding: "11px 22px", fontSize: 14, borderRadius: 12 }}>+ New project</button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMuted }}>
            <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.5s infinite" }}>◉</div>Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMuted }}>
            <div style={{ fontSize: 48, marginBottom: 16, color: C.gold, opacity: 0.4 }}>◉</div>
            <p style={{ fontSize: 15, marginBottom: 20 }}>{q ? "No projects match." : "Create your first project to get started."}</p>
            {!q && <button onClick={create} style={{ ...BTN.gold, padding: "13px 28px", fontSize: 15, borderRadius: 14 }}>+ New project</button>}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 18 }}>
            {filtered.map(p => {
              const pct = p.sequence?.length ? ((p.step / p.sequence.length) * 100).toFixed(1) : "0.0";
              const pending = confirmDel === p.id;
              return (
                <div key={p.id} style={{ background: C.bgPanel, border: `1px solid ${C.borderDark}`, borderRadius: 18, overflow: "hidden", transition: "transform .15s, box-shadow .15s", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${C.goldBorder}`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}>
                  {/* Mini board */}
                  <div style={{ aspectRatio: "1", background: `radial-gradient(circle, ${C.bgDark} 0%, ${C.bgDeep} 100%)`, padding: 8 }}>
                    <div style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }}>
                      <MiniBoard seq={p.sequence || []} />
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 10px" }}>
                    <CardName name={p.name} onSave={async n => { await api(`/api/projects/${p.id}`, "PATCH", { name: n }); load(); }} />
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace", marginBottom: 12 }}>
                      {(p.sequence?.length || 0).toLocaleString()} lines · {timeAgo(p.updated_at)}
                      {p.share_code && <span style={{ marginLeft: 8, color: C.green, background: C.greenDim, borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>SHARED</span>}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.goldBright})`, borderRadius: 3, transition: "width .3s" }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace", marginTop: 5 }}>Step {(p.step||0).toLocaleString()} / {(p.sequence?.length||0).toLocaleString()} ({pct}%)</div>
                  </div>
                  {/* Actions */}
                  {pending ? (
                    <div style={{ padding: "10px 16px 14px", display: "flex", alignItems: "center", gap: 8, background: "rgba(229,62,62,0.08)", borderTop: `1px solid rgba(229,62,62,0.2)` }}>
                      <span style={{ fontSize: 12, color: "#fc8181", flex: 1, fontWeight: 600 }}>Delete &quot;{p.name}&quot;?</span>
                      <button onClick={() => del(p)} style={{ ...BTN.danger, padding: "7px 16px", fontSize: 13 }}>Delete</button>
                      <button onClick={() => setConfirmDel(null)} style={{ ...BTN.ghost, padding: "7px 14px", fontSize: 13 }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px 14px", display: "flex", gap: 8, alignItems: "center", borderTop: `1px solid ${C.borderDark}` }}>
                      <button onClick={() => onOpen(p)} style={{ ...BTN.gold, padding: "9px 18px", fontSize: 13, borderRadius: 10 }}>{p.step > 0 ? "Continue" : "Open"}</button>
                      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                        <button onClick={() => setShareFor(p)} style={{ ...BTN.outline, padding: "9px 14px", fontSize: 12, borderRadius: 10 }}>Share</button>
                        <button onClick={() => dup(p)} style={{ ...BTN.ghost, padding: "9px 14px", fontSize: 12, borderRadius: 10 }}>Dup</button>
                        <button onClick={() => setConfirmDel(p.id)} style={{ ...BTN.danger, padding: "9px 14px", fontSize: 12, borderRadius: 10 }}>Del</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {shareFor && <ShareModal project={shareFor} onClose={() => { setShareFor(null); load(); }} />}
    </div>
  );
}

function CardName({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  const commit = () => { setEditing(false); if (draft.trim() && draft !== name) onSave(draft.trim()); else setDraft(name); };
  if (editing) return <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(name); setEditing(false); } }}
    style={{ width: "100%", fontSize: 15, fontWeight: 700, background: "rgba(255,255,255,0.06)", border: `1.5px solid ${C.goldBorder}`, borderRadius: 8, padding: "5px 10px", marginBottom: 4, boxSizing: "border-box", outline: "none", color: C.textWhite }} />;
  return <div onClick={() => setEditing(true)} style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, cursor: "text", color: C.textWhite, display: "flex", alignItems: "center", gap: 6 }}>
    {name}<span style={{ fontSize: 10, color: C.textMuted }}>✎</span>
  </div>;
}

// ── Share modal ────────────────────────────────────────────────────────────────
function ShareModal({ project, onClose }) {
  const [code, setCode] = useState(project.share_code || null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const generate = async () => { setLoading(true); const res = await api(`/api/projects/${project.id}/share`, "POST", { action: "generate" }); if (res.code) setCode(res.code); setLoading(false); };
  const revoke = async () => { await api(`/api/projects/${project.id}/share`, "POST", { action: "revoke" }); setCode(null); };
  const doCopy = () => { copyText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20, minHeight: "100vh" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bgPanel, borderRadius: 24, padding: "28px 24px", width: "100%", maxWidth: 480, border: `1px solid ${C.borderDark}`, boxShadow: "0 30px 80px rgba(0,0,0,0.7)", animation: "fadeIn 0.2s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.textWhite, letterSpacing: "-0.02em" }}>Share project</h2>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: C.textLight, borderRadius: 8, width: 32, height: 32, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 22, lineHeight: 1.6 }}>
          Anyone with this code can open <strong style={{ color: C.textLight }}>{project.name}</strong> on the public site — nothing else.
        </p>
        {code ? (
          <>
            {/* Code display */}
            <div style={{ background: "rgba(201,168,76,0.08)", border: `2px dashed ${C.goldBorder}`, borderRadius: 16, padding: "18px 20px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <code style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.12em", fontFamily: "monospace", color: C.goldBright }}>{code}</code>
              <button onClick={doCopy} style={{ ...BTN.gold, padding: "9px 18px", fontSize: 13, borderRadius: 10, flexShrink: 0, background: copied ? `linear-gradient(135deg, ${C.green}, #16a34a)` : `linear-gradient(135deg, ${C.goldBright}, ${C.gold})` }}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={generate} disabled={loading} style={{ ...BTN.ghost, flex: 1, padding: "11px 0", fontSize: 13, borderRadius: 12 }}>New code</button>
              <button onClick={revoke} style={{ ...BTN.danger, flex: 1, padding: "11px 0", fontSize: 13, borderRadius: 12 }}>Stop sharing</button>
            </div>
          </>
        ) : (
          <button onClick={generate} disabled={loading} style={{ ...BTN.gold, width: "100%", padding: "16px 0", fontSize: 16, borderRadius: 14 }}>
            {loading ? "Generating…" : "Generate sharing code"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Editor ─────────────────────────────────────────────────────────────────────
function Editor({ project: initialProject, onBack }) {
  const [project, setProject] = useState(initialProject);
  const seq = project.sequence || [];
  const [step, setStep] = useState(project.step || 0);
  const [intervalSec, setIntervalSec] = useState(project.interval_sec || 2);
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [tab, setTab] = useState(seq.length ? "play" : "input");
  const [raw, setRaw] = useState(() => (seq || []).map(([a,b]) => `${a} ${b}`).join("\n"));
  const [parseErr, setParseErr] = useState([]);
  const [jump, setJump] = useState("");
  const saveTimer = useRef(null);

  const save = (fields) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => { await api(`/api/projects/${project.id}`, "PATCH", fields); }, 800);
  };
  useEffect(() => { save({ step, interval_sec: intervalSec }); }, [step, intervalSec]);

  useEffect(() => {
    if (!playing) return;
    if (step >= seq.length) { setPlaying(false); return; }
    const id = setInterval(() => {
      let end = false;
      setStep(s => { const n = Math.min(seq.length, s + 1); if (n >= seq.length) end = true; return n; });
      if (end) setPlaying(false);
    }, intervalSec * 1000);
    return () => clearInterval(id);
  }, [playing, intervalSec, seq.length]);

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); setStep(s => Math.max(0, s-1)); }
      else if (e.code === "ArrowRight") { e.preventDefault(); setStep(s => Math.min(seq.length, s+1)); }
      else if (e.code === "Home") { e.preventDefault(); setPlaying(false); setStep(0); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [seq.length]);

  const loadSeq = async () => {
    const { seq: parsed, errors } = parseSequence(raw);
    setParseErr(errors);
    if (parsed.length) {
      const res = await api(`/api/projects/${project.id}`, "PATCH", { sequence: parsed, step: 0 });
      if (res.project) { setProject(res.project); setStep(0); setTab("play"); }
    }
  };

  const cur = (step > 0 && step <= seq.length) ? seq[step-1] : null;
  const pct = seq.length ? ((step / seq.length) * 100).toFixed(1) : "0.0";

  const TABS = ["play","input","stats","io"];

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: C.bgDeep, fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: C.bgDark, borderBottom: `1px solid ${C.borderDark}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
          <button onClick={onBack} style={{ ...BTN.ghost, padding: "8px 14px", fontSize: 14, flexShrink: 0 }}>←</button>
          <input value={project.name}
            onChange={async e => { const n = e.target.value; setProject(p => ({...p, name: n})); await api(`/api/projects/${project.id}`, "PATCH", { name: n }); }}
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 16, fontWeight: 700, color: C.textWhite, outline: "none", minWidth: 0 }} />
          <span style={{ fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block", boxShadow: `0 0 6px ${C.green}` }} />Saved
          </span>
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", overflowX: "auto", padding: "0 10px 10px", gap: 6, scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} disabled={t !== "input" && !seq.length}
              style={{ background: tab === t ? `linear-gradient(135deg, ${C.goldBright}, ${C.gold})` : "rgba(255,255,255,0.05)", border: tab === t ? "none" : `1px solid ${C.borderDark}`, color: tab === t ? "#1a1200" : C.textMuted, borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: tab === t ? 700 : 500, whiteSpace: "nowrap", flexShrink: 0, cursor: t !== "input" && !seq.length ? "not-allowed" : "pointer", transition: "all .15s" }}>
              {t === "io" ? "Import/Export" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Canvas */}
        <div style={{ flexShrink: 0, padding: "12px 12px 6px" }}>
          {seq.length === 0
            ? <div style={{ height: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: `2px dashed ${C.borderDark}`, borderRadius: 16, color: C.textMuted, gap: 12 }}>
                <div style={{ fontSize: 40, color: C.gold, opacity: 0.5 }}>◉</div>
                <p style={{ margin: 0, fontSize: 14 }}>Add connections in the Input tab.</p>
                <button onClick={() => setTab("input")} style={{ ...BTN.gold, padding: "11px 24px", fontSize: 14, borderRadius: 12 }}>Add connections</button>
              </div>
            : <Board sequence={seq} step={step} sz={Math.min(typeof window!=="undefined"?window.innerWidth:400, 400) - 24} />
          }
          {seq.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <button onClick={() => setView({ zoom: 1, x: 0, y: 0 })} style={{ ...BTN.ghost, padding: "6px 12px", fontSize: 12 }}>Reset</button>
              <div style={{ marginLeft: "auto", display: "flex", background: "rgba(255,255,255,0.06)", border: `1px solid ${C.borderDark}`, borderRadius: 10, overflow: "hidden" }}>
                <button onClick={() => setView(v => ({ ...v, zoom: Math.max(0.4, v.zoom / 1.2) }))} style={{ background: "none", border: "none", color: C.textLight, padding: "6px 14px", fontSize: 18, cursor: "pointer" }}>−</button>
                <span style={{ color: C.textMuted, fontSize: 12, display: "flex", alignItems: "center", minWidth: 46, justifyContent: "center", borderLeft: `1px solid ${C.borderDark}`, borderRight: `1px solid ${C.borderDark}` }}>{Math.round(view.zoom * 100)}%</span>
                <button onClick={() => setView(v => ({ ...v, zoom: Math.min(12, v.zoom * 1.2) }))} style={{ background: "none", border: "none", color: C.textLight, padding: "6px 14px", fontSize: 18, cursor: "pointer" }}>+</button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom panel — white */}
        <div style={{ flex: 1, background: C.bgLight, borderRadius: "22px 22px 0 0", overflowY: "auto", WebkitOverflowScrolling: "touch", marginTop: 8, boxShadow: "0 -4px 30px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
            <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 2 }} />
          </div>
          <div style={{ padding: "8px 20px 36px" }}>

            {tab === "play" && seq.length > 0 && (
              <>
                {/* Step */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 42, fontWeight: 800, fontFamily: "monospace", color: C.textDark, lineHeight: 1 }}>{step.toLocaleString()}</span>
                    <span style={{ fontSize: 15, color: "#94a3b8", fontFamily: "monospace" }}>/ {seq.length.toLocaleString()}</span>
                  </div>
                  <div style={{ background: "#fefce8", border: "1.5px solid #fde68a", borderRadius: 12, padding: "10px 14px", textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 3 }}>Current</div>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: "#92400e" }}>{cur ? `${cur[0]} → ${cur[1]}` : "—"}</div>
                  </div>
                </div>
                {/* Progress */}
                <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: 5 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.gold}, ${C.goldBright})`, borderRadius: 4, transition: "width .2s" }} />
                </div>
                <div style={{ fontSize: 12, fontFamily: "monospace", color: "#94a3b8", marginBottom: 18 }}>{pct}% complete</div>
                {/* Slider */}
                <input type="range" min={0} max={seq.length} value={step} onChange={e => setStep(Number(e.target.value))} style={{ width: "100%", marginBottom: 20, accentColor: C.gold, height: 6 }} />
                {/* Transport */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setStep(s => Math.max(0, s-1))} style={{ ...BTN.light, width: 56, height: 56, borderRadius: 14, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>⏮</button>
                  <button onClick={() => setPlaying(p => !p)} style={{ ...BTN.gold, width: 72, height: 72, borderRadius: 20, fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>{playing ? "⏸" : "▶"}</button>
                  <button onClick={() => setStep(s => Math.min(seq.length, s+1))} style={{ ...BTN.light, width: 56, height: 56, borderRadius: 14, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>⏭</button>
                  <button onClick={() => { setPlaying(false); setStep(0); }} style={{ ...BTN.light, width: 56, height: 56, borderRadius: 14, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>🔄</button>
                </div>
                {/* Interval */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, marginBottom: 14 }}>
                  <span style={{ fontSize: 14, color: C.textDark, fontWeight: 600 }}>Step every</span>
                  <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))} style={{ padding: "8px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 15, background: "#fff", color: C.textDark, fontWeight: 600, outline: "none" }}>
                    {INTERVALS.map(s => <option key={s} value={s}>{s} second{s > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
                {/* Jump */}
                <div style={{ display: "flex", gap: 10 }}>
                  <input value={jump} onChange={e => setJump(e.target.value)} placeholder="Jump to step #" inputMode="numeric"
                    onKeyDown={e => e.key === "Enter" && setStep(Math.max(0, Math.min(seq.length, parseInt(jump,10)||0)))}
                    style={{ flex: 1, padding: "14px 16px", border: "1.5px solid #e2e8f0", borderRadius: 12, fontSize: 15, fontFamily: "monospace", outline: "none", background: "#fff", color: C.textDark }} />
                  <button onClick={() => setStep(Math.max(0, Math.min(seq.length, parseInt(jump,10)||0)))} style={{ ...BTN.gold, padding: "14px 22px", fontSize: 15, borderRadius: 12 }}>Go</button>
                </div>
              </>
            )}

            {tab === "input" && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.textDark, marginBottom: 8 }}>Connection sequence</div>
                <p style={{ fontSize: 12, color: C.textGrey, marginBottom: 12, lineHeight: 1.6 }}>Accepts: <code style={{ background: "#f1f5f9", padding: "2px 5px", borderRadius: 4 }}>Step 1: PIN 54 to PIN 67</code>, <code style={{ background: "#f1f5f9", padding: "2px 5px", borderRadius: 4 }}>54 67</code>, <code style={{ background: "#f1f5f9", padding: "2px 5px", borderRadius: 4 }}>54,67</code></p>
                <textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={"- Step 1: PIN 54 to PIN 67\n- Step 2: PIN 67 to PIN 50\nor simply: 54 67"}
                  style={{ width: "100%", height: 200, border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 14, fontSize: 13, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", outline: "none", color: C.textDark, background: "#fafafa" }} />
                {parseErr.length > 0 && (
                  <div style={{ background: "rgba(229,62,62,0.08)", border: "1px solid rgba(229,62,62,0.25)", borderRadius: 10, padding: 12, marginTop: 10, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: C.red, marginBottom: 6 }}>{parseErr.length} invalid row{parseErr.length > 1 ? "s" : ""}</div>
                    {parseErr.slice(0, 5).map((e, i) => <div key={i} style={{ color: "#c53030", marginBottom: 3 }}>Line {e.line}: {e.reason}</div>)}
                  </div>
                )}
                <button onClick={loadSeq} style={{ ...BTN.gold, width: "100%", marginTop: 14, padding: 16, fontSize: 15, borderRadius: 14 }}>
                  Load {parseSequence(raw).seq.length.toLocaleString()} connections
                </button>
              </>
            )}

            {tab === "stats" && seq.length > 0 && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.textDark, marginBottom: 14 }}>Statistics</div>
                {[["Total lines", seq.length.toLocaleString()], ["Current step", step.toLocaleString()], ["Remaining", (seq.length - step).toLocaleString()]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14 }}>
                    <span style={{ color: C.textGrey, fontWeight: 500 }}>{k}</span>
                    <span style={{ fontWeight: 700, fontFamily: "monospace", color: C.textDark }}>{v}</span>
                  </div>
                ))}
              </>
            )}

            {tab === "io" && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.textDark, marginBottom: 10 }}>Import</div>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 72, border: `2px dashed #cbd5e1`, borderRadius: 14, color: C.textGrey, fontSize: 14, cursor: "pointer", marginBottom: 22, background: "#f8fafc", gap: 8 }}>
                  <input type="file" accept=".txt,.csv,.json" style={{ display: "none" }} onChange={e => {
                    const file = e.target.files[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async () => {
                      let text = reader.result;
                      if (file.name.endsWith(".json")) { try { const d = JSON.parse(text); const arr = Array.isArray(d) ? d : d.sequence; text = arr.map(p => Array.isArray(p) ? `${p[0]} ${p[1]}` : `${p.from} ${p.to}`).join("\n"); } catch { return; } }
                      const { seq: parsed } = parseSequence(text);
                      if (parsed.length) { const res = await api(`/api/projects/${project.id}`, "PATCH", { sequence: parsed, step: 0 }); if (res.project) { setProject(res.project); setRaw(parsed.map(([a,b]) => `${a} ${b}`).join("\n")); setStep(0); setTab("play"); } }
                    };
                    reader.readAsText(file);
                  }} />
                  📂 Drop or choose — TXT, CSV, or JSON
                </label>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.textDark, marginBottom: 10 }}>Export</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {["txt","csv","json"].map(fmt => (
                    <button key={fmt} onClick={() => {
                      const content = fmt === "json" ? JSON.stringify({ pins: PIN_COUNT, sequence: seq }, null, 2) : fmt === "csv" ? "from,to\n" + seq.map(([a,b]) => `${a},${b}`).join("\n") : seq.map(([a,b]) => `${a} ${b}`).join("\n");
                      const blob = new Blob([content], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = project.name.replace(/\s+/g,"_") + "." + fmt; a.click();
                    }} style={{ ...BTN.light, padding: "12px 0", fontSize: 14, borderRadius: 10 }}>{fmt.toUpperCase()}</button>
                  ))}
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  useMobileMeta();
  const [mode, setMode] = useState("loading");
  const [user, setUser] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [openProject, setOpenProject] = useState(null);
  const [publicProject, setPublicProject] = useState(null);

  useEffect(() => {
    api("/api/auth/me").then(res => {
      if (res.user) { setUser(res.user); setMode("owner-dash"); }
      else setMode("public");
    });
  }, []);

  if (mode === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bgDeep, fontFamily: "system-ui,sans-serif", color: C.textMuted }}>
        <div style={{ fontSize: 48, color: C.gold, marginBottom: 16, animation: "pulse 1.5s infinite" }}>◉</div>
        <div style={{ fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (mode === "public" && publicProject) return <PublicViewer project={publicProject} onBack={() => setPublicProject(null)} />;
  if (mode === "public") return <PublicHome onJoined={p => setPublicProject(p)} onOwnerAccess={() => setMode("owner-gate")} />;
  if (mode === "owner-gate") return <OwnerGate onPassed={p => { setPassphrase(p); setMode("owner-auth"); }} onBack={() => setMode("public")} />;
  if (mode === "owner-auth") return <OwnerAuth passphrase={passphrase} onAuthed={u => { setUser(u); setMode("owner-dash"); }} onBack={() => setMode("public")} />;

  if (mode === "owner-dash" && user) {
    if (openProject) return <Editor project={openProject} onBack={() => setOpenProject(null)} />;
    return <Dashboard user={user} onOpen={p => setOpenProject(p)} onLogout={() => { setUser(null); setOpenProject(null); setMode("public"); }} />;
  }

  return null;
}
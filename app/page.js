"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const PIN_COUNT = 240;
const INTERVALS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];

function useMobileMeta() {
  useEffect(() => {
    let meta = document.querySelector("meta[name=viewport]");
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
    const style = document.createElement("style");
    style.textContent = `* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; } body { margin: 0; overscroll-behavior: none; } input, select, textarea { font-size: 16px !important; } button { touch-action: manipulation; }`;
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

// ── API calls ──────────────────────────────────────────────────────────────────
async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Board canvas ───────────────────────────────────────────────────────────────
function Board({ sequence, step, view, onView }) {
  const baseRef = useRef(null), overRef = useRef(null), wrapRef = useRef(null);
  const [sz, setSz] = useState(600);
  const committedTo = useRef(0), lastViewKey = useRef("");
  const DPR = Math.min(typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1, 2);
  const L = 1000, cx = 500, cy = 500, R = 474;
  const pins = useMemo(() => pinPositions(PIN_COUNT, R, cx, cy), []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => { const s = Math.min(e.contentRect.width, e.contentRect.height); if (s > 0) setSz(s); });
    ro.observe(wrapRef.current); return () => ro.disconnect();
  }, []);

  const applyXform = useCallback((ctx) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const scale = (sz / L) * view.zoom;
    ctx.translate(sz / 2 + view.x, sz / 2 + view.y);
    ctx.scale(scale, scale); ctx.translate(-cx, -cy);
  }, [DPR, sz, view.zoom, view.x, view.y]);

  const paintBoard = useCallback((ctx) => {
    ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.09)"; ctx.lineWidth = 1.5; ctx.stroke();
  }, []);

  const repaintBase = useCallback((upto) => {
    const c = baseRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    applyXform(ctx); paintBoard(ctx);
    ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(60,60,80,0.28)"; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < upto; i++) {
      const [a, b] = sequence[i];
      ctx.moveTo(pins[a-1][0], pins[a-1][1]); ctx.lineTo(pins[b-1][0], pins[b-1][1]);
    }
    ctx.stroke(); committedTo.current = upto;
  }, [applyXform, paintBoard, pins, sequence]);

  const appendBase = useCallback((from, to) => {
    const c = baseRef.current; if (!c) return;
    const ctx = c.getContext("2d"); applyXform(ctx);
    ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(60,60,80,0.28)"; ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = from; i < to; i++) {
      const [a, b] = sequence[i];
      ctx.moveTo(pins[a-1][0], pins[a-1][1]); ctx.lineTo(pins[b-1][0], pins[b-1][1]);
    }
    ctx.stroke(); committedTo.current = to;
  }, [applyXform, pins, sequence]);

  useEffect(() => {
    const key = `${sz}|${view.zoom}|${view.x}|${view.y}`;
    const viewChanged = key !== lastViewKey.current; lastViewKey.current = key;
    if (viewChanged) { committedTo.current = 0; repaintBase(step); return; }
    if (step > committedTo.current) appendBase(committedTo.current, step);
    else if (step < committedTo.current) repaintBase(step);
  }, [step, sz, view.zoom, view.x, view.y, repaintBase, appendBase]);

  useEffect(() => {
    const c = overRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    applyXform(ctx);
    const scale = (sz / L) * view.zoom;
    const cur = (step > 0 && step <= sequence.length) ? sequence[step-1] : null;
    if (cur) {
      const pa = pins[cur[0]-1], pb = pins[cur[1]-1];
      ctx.lineCap = "round"; ctx.lineWidth = 2.2; ctx.strokeStyle = "#cc1a1a";
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    }
    const active = new Set(cur ? [cur[0], cur[1]] : []);
    for (let i = 0; i < PIN_COUNT; i++) {
      const [x, y] = pins[i]; const on = active.has(i+1);
      ctx.beginPath(); ctx.arc(x, y, on ? 5 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#cc1a1a" : "rgba(40,40,55,0.45)"; ctx.fill();
    }
    if (scale > 0.5) {
      for (let i = 0; i < PIN_COUNT; i++) {
        const on = active.has(i+1); if (!on && scale < 0.85) continue;
        const ang = (i / PIN_COUNT) * Math.PI * 2 - Math.PI / 2;
        const lx = cx + Math.cos(ang) * (R + 14), ly = cy + Math.sin(ang) * (R + 14);
        ctx.save(); ctx.translate(lx, ly); ctx.scale(1/scale, 1/scale);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = on ? "#cc1a1a" : "rgba(40,40,55,0.5)";
        ctx.font = `${on ? 700 : 400} 11px ui-monospace,monospace`;
        ctx.fillText(String(i+1), 0, 0); ctx.restore();
      }
    }
  }, [step, sz, view.zoom, view.x, view.y, applyXform, pins, sequence]);

  const drag = useRef(null);
  const CA = { width: sz * DPR, height: sz * DPR, style: { width: sz, height: sz, position: "absolute", top: 0, left: 0 } };
  return (
    <div ref={wrapRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#dde0e5", borderRadius: 12, overflow: "hidden", minHeight: 0 }}>
      <div style={{ position: "relative", width: sz, height: sz }}>
        <canvas ref={baseRef} {...CA} />
        <canvas ref={overRef} {...CA} style={{ ...CA.style, touchAction: "none", cursor: "grab" }}
          onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (!drag.current) return; onView(v => ({ ...v, x: drag.current.vx + e.clientX - drag.current.x, y: drag.current.vy + e.clientY - drag.current.y })); }}
          onPointerUp={e => { drag.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} }}
          onWheel={e => { e.preventDefault(); const f = e.deltaY < 0 ? 1.12 : 1/1.12; onView(v => ({ ...v, zoom: Math.max(0.4, Math.min(12, v.zoom * f)) })); }}
        />
      </div>
    </div>
  );
}

function MiniBoard({ seq }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"), S = 200, R = 90, cxc = 100, cyc = 100;
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(cxc, cyc, R, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.07)"; ctx.lineWidth = 1; ctx.stroke();
    if (!seq || !seq.length) return;
    const pts = pinPositions(PIN_COUNT, R - 4, cxc, cyc);
    ctx.strokeStyle = "rgba(60,60,80,0.28)"; ctx.lineWidth = 0.5; ctx.beginPath();
    const max = Math.min(seq.length, 3000);
    for (let i = 0; i < max; i++) { const [a, b] = seq[i]; ctx.moveTo(pts[a-1][0], pts[a-1][1]); ctx.lineTo(pts[b-1][0], pts[b-1][1]); }
    ctx.stroke();
  }, [seq]);
  return <canvas ref={ref} width={200} height={200} style={{ width: "100%", height: "100%", display: "block" }} />;
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
    <div style={{ minHeight: "100vh", background: "#f7f8fa", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e8eaed", padding: "0 20px", height: 56, display: "flex", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={handleLogoTap}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>◉</div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#1a1a2e" }}>The Memory Circle</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px 48px" }}>
        <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
          <div style={{ marginBottom: 28, display: "flex", justifyContent: "center" }}>
            <PublicArt />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>Join a shared string art project</h1>
          <p style={{ fontSize: 15, color: "#777", margin: "0 0 28px", lineHeight: 1.6 }}>Enter the code you received to follow along step by step.</p>
          <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", boxShadow: "0 4px 24px rgba(0,0,0,0.09)", textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>Project code</label>
            <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setErr(""); }} onKeyDown={e => e.key === "Enter" && join()} placeholder="SART-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              style={{ width: "100%", padding: "16px 18px", fontSize: 20, fontFamily: "ui-monospace,monospace", fontWeight: 700, letterSpacing: "0.1em", border: `2.5px solid ${err ? "#ffaaaa" : "#e8eaed"}`, borderRadius: 12, outline: "none", boxSizing: "border-box", marginBottom: 12, color: "#1a1a2e", background: err ? "#fff8f8" : "#fafbfc" }} />
            {err && <div style={{ background: "#fff0f0", border: "1px solid #ffcccc", color: "#c00", borderRadius: 10, padding: "12px 16px", fontSize: 14, marginBottom: 14, lineHeight: 1.4 }}>{err}</div>}
            <button onClick={join} disabled={loading} style={{ width: "100%", padding: "18px 0", background: loading ? "#888" : "#1a1a2e", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 17, cursor: loading ? "default" : "pointer" }}>
              {loading ? "Opening…" : "Join Project →"}
            </button>
          </div>
          <p style={{ fontSize: 13, color: "#bbb", marginTop: 20 }}>Don&apos;t have a code? Ask the project owner to share one with you.</p>
        </div>
      </div>
    </div>
  );
}

function PublicArt() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"), S = 160, R = 68, cx = 80, cy = 80;
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 1; ctx.stroke();
    const pts = pinPositions(80, R - 4, cx, cy);
    const seq = []; let p = 0;
    for (let k = 0; k < 320; k++) { const n = (p + 31) % 80; seq.push([p, n]); p = n; }
    let i = 0; let raf;
    const tick = () => {
      for (let s = 0; s < 2 && i < seq.length; s++, i++) {
        ctx.strokeStyle = "rgba(60,60,80,0.25)"; ctx.lineWidth = 0.6; ctx.beginPath();
        ctx.moveTo(pts[seq[i][0]][0], pts[seq[i][0]][1]); ctx.lineTo(pts[seq[i][1]][0], pts[seq[i][1]][1]); ctx.stroke();
      }
      if (i < seq.length) raf = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={160} height={160} style={{ borderRadius: "50%", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} />;
}

// ── Public viewer ──────────────────────────────────────────────────────────────
function PublicViewer({ project, onBack }) {
  const seq = project.sequence || [];
  const total = seq.length;
  const [step, setStep] = useState(project.step || 0);
  const [playing, setPlaying] = useState(false);
  const [intervalSec, setIntervalSec] = useState(project.interval_sec || 2);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [jump, setJump] = useState("");
  const pct = total ? ((step / total) * 100).toFixed(1) : "0.0";
  const cur = (step > 0 && step <= total) ? seq[step-1] : null;

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

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#1a1a2e", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", height: 50, background: "#111120", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 600 }}>← Back</button>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "center", margin: "0 10px" }}>{project.name}</span>
        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)", borderRadius: 8, padding: "4px 8px" }}>Shared</span>
      </div>
      <div style={{ flexShrink: 0, padding: "12px 12px 6px" }}>
        <Board sequence={seq} step={step} view={view} onView={setView} />
      </div>
      <div style={{ flex: 1, background: "#fff", borderRadius: "20px 20px 0 0", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ padding: "20px 20px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 36, fontWeight: 700, fontFamily: "monospace", color: "#1a1a2e", lineHeight: 1 }}>{step.toLocaleString()}</span>
              <span style={{ fontSize: 14, color: "#bbb", fontFamily: "monospace" }}>/ {total.toLocaleString()}</span>
            </div>
            <div style={{ background: "#f5f5f5", borderRadius: 10, padding: "8px 14px", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: "#cc1a1a" }}>{cur ? `${cur[0]} → ${cur[1]}` : "—"}</div>
            </div>
          </div>
          <div style={{ height: 7, background: "#eee", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#1a1a2e", borderRadius: 4, transition: "width .15s" }} />
          </div>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#aaa", marginBottom: 18 }}>{pct}% complete</div>
          <input type="range" min={0} max={total} value={step} onChange={e => setStep(Number(e.target.value))} style={{ width: "100%", marginBottom: 20, accentColor: "#1a1a2e" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 }}>
            <button onClick={() => setStep(s => Math.max(0, s-1))} style={{ width: 52, height: 52, borderRadius: 12, border: "1.5px solid #e0e3e8", background: "#f7f8fa", fontSize: 20 }}>⏮</button>
            <button onClick={() => setPlaying(p => !p)} style={{ width: 68, height: 68, borderRadius: 16, border: "none", background: "#1a1a2e", color: "#fff", fontSize: 26 }}>{playing ? "⏸" : "▶"}</button>
            <button onClick={() => setStep(s => Math.min(total, s+1))} style={{ width: 52, height: 52, borderRadius: 12, border: "1.5px solid #e0e3e8", background: "#f7f8fa", fontSize: 20 }}>⏭</button>
            <button onClick={() => { setPlaying(false); setStep(0); }} style={{ width: 52, height: 52, borderRadius: 12, border: "1.5px solid #e0e3e8", background: "#f7f8fa", fontSize: 20 }}>🔄</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#f7f8fa", borderRadius: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 14, color: "#555", fontWeight: 500 }}>Auto-step interval</span>
            <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))} style={{ padding: "8px 12px", border: "1px solid #e0e3e8", borderRadius: 8, fontSize: 15, background: "#fff" }}>
              {INTERVALS.map(s => <option key={s} value={s}>{s}s</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={jump} onChange={e => setJump(e.target.value)} placeholder="Jump to step number" inputMode="numeric" onKeyDown={e => e.key === "Enter" && setStep(Math.max(0, Math.min(total, parseInt(jump,10)||0)))} style={{ flex: 1, padding: "13px 14px", border: "1.5px solid #e0e3e8", borderRadius: 10, fontSize: 15, fontFamily: "monospace", outline: "none", background: "#fafafa" }} />
            <button onClick={() => setStep(Math.max(0, Math.min(total, parseInt(jump,10)||0)))} style={{ padding: "13px 18px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600 }}>Go</button>
          </div>
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
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", padding: 20 }}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}`}</style>
      <div style={{ width: "100%", maxWidth: 400, background: "#1a1a2e", borderRadius: 20, padding: "36px 28px", border: "1px solid rgba(255,255,255,0.08)", animation: shake ? "shake 0.5s ease" : "none" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 20 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", marginBottom: 6 }}>Private access</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Enter the owner passphrase to continue</div>
        </div>
        <input type="password" value={phrase} onChange={e => { setPhrase(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && check()} placeholder="Passphrase" autoFocus
          style={{ width: "100%", padding: "16px 18px", background: "rgba(255,255,255,0.07)", border: `2px solid ${err ? "rgba(255,80,80,0.5)" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, color: "#fff", fontSize: 17, outline: "none", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" }} />
        {err && <div style={{ fontSize: 12, color: "#ff8080", marginBottom: 10 }}>{err}</div>}
        <button onClick={check} style={{ width: "100%", padding: "16px 0", background: "#fff", color: "#1a1a2e", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 17, cursor: "pointer", marginBottom: 16 }}>Continue →</button>
        <div style={{ textAlign: "center" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: 12, cursor: "pointer" }}>← Back to public site</button>
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

  const inp = { width: "100%", padding: "14px 16px", border: "1.5px solid #e0e3e8", borderRadius: 12, fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 14 };
  const lbl = { display: "block", fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 5 };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 20, padding: "32px 24px", boxShadow: "0 4px 32px rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>◉</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>Owner Dashboard</div>
            <div style={{ fontSize: 12, color: "#888" }}>The Memory Circle · Private access</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#f0f2f5", borderRadius: 8, padding: 3, marginBottom: 20 }}>
          {["login","register"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "none", background: mode === m ? "#fff" : "transparent", fontWeight: mode === m ? 600 : 400, cursor: "pointer", fontSize: 13, boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
              {m === "login" ? "Log in" : "Create account"}
            </button>
          ))}
        </div>
        {mode === "register" && <><label style={lbl}>Name</label><input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></>}
        <label style={lbl}>Email</label>
        <input style={inp} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="your@email.com" />
        {mode !== "forgot" && <><label style={lbl}>Password</label><input style={inp} type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder="••••••••" /></>}
        {err && <div style={{ background: "#fff0f0", border: "1px solid #ffcccc", color: "#c00", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{err}</div>}
        {notice && <div style={{ background: "#f0fff4", border: "1px solid #b2f0c8", color: "#0a6635", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{notice}</div>}
        <button onClick={submit} style={{ width: "100%", padding: 14, background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: "pointer", marginBottom: 12 }}>
          {mode === "login" ? "Log in to dashboard" : mode === "register" ? "Create account" : "Send reset link"}
        </button>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#aaa", fontSize: 12, cursor: "pointer" }}>← Back</button>
          <button onClick={() => setMode("forgot")} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 12 }}>Forgot password?</button>
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

  const del = async (p) => {
    await api(`/api/projects/${p.id}`, "DELETE");
    setConfirmDel(null); load();
  };

  const dup = async (p) => {
    const res = await api("/api/projects", "POST", { name: p.name + " copy" });
    if (res.project) {
      await api(`/api/projects/${res.project.id}`, "PATCH", { sequence: p.sequence, step: 0, interval_sec: p.interval_sec });
      load();
    }
  };

  const filtered = q ? projects.filter(p => p.name.toLowerCase().includes(q.toLowerCase())) : projects;

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "#1a1a2e", color: "#fff", padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a2e", fontWeight: 700, fontSize: 12 }}>◉</div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>The Memory Circle</span>
          <span style={{ fontSize: 10, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", borderRadius: 8, padding: "2px 8px" }}>Owner</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</span>
          <button onClick={async () => { await api("/api/auth/logout", "POST"); onLogout(); }} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 7, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>Log out</button>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 14px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>Your projects</h1>
            <p style={{ margin: "4px 0 0", color: "#888", fontSize: 13 }}>{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 140 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#aaa", fontSize: 14 }}>⌕</span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" style={{ padding: "10px 12px 10px 30px", border: "1px solid #e0e3e8", borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", width: "100%" }} />
            </div>
            <button onClick={create} style={{ background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>+ New</button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>◉</div>
            <p>{q ? "No projects match." : "Create your first project to get started."}</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 16 }}>
            {filtered.map(p => {
              const pct = p.sequence?.length ? ((p.step / p.sequence.length) * 100).toFixed(1) : "0.0";
              const pending = confirmDel === p.id;
              return (
                <div key={p.id} style={{ background: "#fff", border: "1px solid #e0e3e8", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ aspectRatio: "1", background: "#e8eaed" }}><MiniBoard seq={p.sequence || []} /></div>
                  <div style={{ padding: "12px 14px 8px" }}>
                    <CardName name={p.name} onSave={async n => { await api(`/api/projects/${p.id}`, "PATCH", { name: n }); load(); }} />
                    <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace", marginBottom: 10 }}>
                      {(p.sequence?.length || 0).toLocaleString()} lines · {timeAgo(p.updated_at)}
                      {p.share_code && <span style={{ marginLeft: 8, color: "#1a8c5e", background: "#edfff5", borderRadius: 6, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>SHARED</span>}
                    </div>
                    <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#1a1a2e", borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#bbb", fontFamily: "monospace", marginTop: 4 }}>Step {(p.step||0).toLocaleString()} / {(p.sequence?.length||0).toLocaleString()} ({pct}%)</div>
                  </div>
                  {pending ? (
                    <div style={{ padding: "8px 14px 12px", display: "flex", alignItems: "center", gap: 8, background: "#fff8f8" }}>
                      <span style={{ fontSize: 12, color: "#c00", flex: 1, fontWeight: 500 }}>Delete &quot;{p.name}&quot;?</span>
                      <button onClick={() => del(p)} style={{ background: "#c00", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Delete</button>
                      <button onClick={() => setConfirmDel(null)} style={{ background: "#eee", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ padding: "8px 14px 12px", display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => onOpen(p)} style={{ background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{p.step > 0 ? "Continue" : "Open"}</button>
                      <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                        <button onClick={() => setShareFor(p)} style={{ background: "#f0f2f5", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>Share</button>
                        <button onClick={() => dup(p)} style={{ background: "#f0f2f5", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>Dup</button>
                        <button onClick={() => setConfirmDel(p.id)} style={{ background: "#fff0f0", border: "none", borderRadius: 7, padding: "8px 12px", fontSize: 12, cursor: "pointer", color: "#c00" }}>Delete</button>
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
  if (editing) return <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(name); setEditing(false); } }} style={{ width: "100%", fontSize: 15, fontWeight: 600, border: "1.5px solid #1a1a2e", borderRadius: 6, padding: "4px 8px", marginBottom: 4, boxSizing: "border-box", outline: "none" }} />;
  return <div onClick={() => setEditing(true)} style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, cursor: "text" }}>{name}<span style={{ fontSize: 10, color: "#ddd", marginLeft: 5 }}>✎</span></div>;
}

function ShareModal({ project, onClose }) {
  const [code, setCode] = useState(project.share_code || null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const res = await api(`/api/projects/${project.id}/share`, "POST", { action: "generate" });
    if (res.code) setCode(res.code);
    setLoading(false);
  };
  const revoke = async () => {
    await api(`/api/projects/${project.id}/share`, "POST", { action: "revoke" });
    setCode(null);
  };
  const doCopy = () => { copyText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20, minHeight: "100vh" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: "24px 20px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Share project</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa" }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 20, lineHeight: 1.5 }}>
          Share the code below. Anyone who enters it on the public site gets access to <strong>{project.name}</strong> only — nothing else.
        </p>
        {code ? (
          <>
            <div style={{ background: "#f7f8fa", border: "2px dashed #e0e3e8", borderRadius: 12, padding: "16px 18px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <code style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", fontFamily: "monospace", color: "#1a1a2e" }}>{code}</code>
              <button onClick={doCopy} style={{ background: copied ? "#e8f8ee" : "#fff", border: "1px solid #e0e3e8", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600, color: copied ? "#0a6635" : "#333", flexShrink: 0 }}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={generate} disabled={loading} style={{ flex: 1, padding: "10px 0", border: "1px solid #e0e3e8", background: "#f5f5f5", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>New code</button>
              <button onClick={revoke} style={{ flex: 1, padding: "10px 0", border: "1px solid #ffcccc", background: "#fff0f0", color: "#c00", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Stop sharing</button>
            </div>
          </>
        ) : (
          <button onClick={generate} disabled={loading} style={{ width: "100%", padding: 14, background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
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
    saveTimer.current = setTimeout(async () => {
      await api(`/api/projects/${project.id}`, "PATCH", fields);
    }, 800);
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

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#1a1a2e", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <div style={{ background: "#111120", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px" }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>←</button>
          <input value={project.name} onChange={async e => { const n = e.target.value; setProject(p => ({...p, name: n})); await api(`/api/projects/${project.id}`, "PATCH", { name: n }); }} style={{ flex: 1, background: "transparent", border: "none", fontSize: 15, fontWeight: 600, color: "#fff", outline: "none", minWidth: 0 }} />
          <span style={{ fontSize: 11, color: "#5fd49a", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5fd49a", display: "inline-block" }} />Saved</span>
        </div>
        <div style={{ display: "flex", overflowX: "auto", padding: "0 8px 8px", gap: 4, scrollbarWidth: "none" }}>
          {["play","input","stats","io"].map(t => (
            <button key={t} onClick={() => setTab(t)} disabled={t !== "input" && !seq.length} style={{ background: tab === t ? "rgba(255,255,255,0.18)" : "transparent", border: tab === t ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent", color: tab === t ? "#fff" : "rgba(255,255,255,0.4)", borderRadius: 8, padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0, cursor: t !== "input" && !seq.length ? "not-allowed" : "pointer" }}>
              {t === "io" ? "Import/Export" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flexShrink: 0, padding: "10px 10px 4px" }}>
          {seq.length === 0
            ? <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1.5px dashed rgba(255,255,255,0.15)", borderRadius: 12, color: "rgba(255,255,255,0.35)", gap: 10 }}>
                <div style={{ fontSize: 36 }}>◉</div>
                <p style={{ margin: 0, fontSize: 13 }}>Add connections in the Input tab.</p>
                <button onClick={() => setTab("input")} style={{ background: "#fff", color: "#1a1a2e", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Add connections</button>
              </div>
            : <Board sequence={seq} step={step} view={view} onView={setView} />
          }
          {seq.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <button onClick={() => setView({ zoom: 1, x: 0, y: 0 })} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>Reset</button>
              <div style={{ marginLeft: "auto", display: "flex", background: "rgba(255,255,255,0.08)", borderRadius: 7, overflow: "hidden" }}>
                <button onClick={() => setView(v => ({ ...v, zoom: Math.max(0.4, v.zoom / 1.2) }))} style={{ background: "none", border: "none", color: "#fff", padding: "5px 12px", fontSize: 16, cursor: "pointer" }}>−</button>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "flex", alignItems: "center", minWidth: 40, justifyContent: "center" }}>{Math.round(view.zoom * 100)}%</span>
                <button onClick={() => setView(v => ({ ...v, zoom: Math.min(12, v.zoom * 1.2) }))} style={{ background: "none", border: "none", color: "#fff", padding: "5px 12px", fontSize: 16, cursor: "pointer" }}>+</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, background: "#fff", borderRadius: "20px 20px 0 0", overflowY: "auto", WebkitOverflowScrolling: "touch", marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px" }}>
            <div style={{ width: 36, height: 4, background: "#e0e0e0", borderRadius: 2 }} />
          </div>
          <div style={{ padding: "8px 18px 32px" }}>

            {tab === "play" && seq.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 40, fontWeight: 700, fontFamily: "monospace", color: "#1a1a2e", lineHeight: 1 }}>{step.toLocaleString()}</span>
                  <span style={{ fontSize: 16, color: "#ccc", fontFamily: "monospace" }}>/ {seq.length.toLocaleString()}</span>
                </div>
                <div style={{ height: 6, background: "#eee", borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "#1a1a2e", borderRadius: 3, transition: "width .15s" }} />
                </div>
                <div style={{ fontSize: 11, fontFamily: "monospace", color: "#aaa", marginBottom: 14 }}>{pct}% complete</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[["Connection", cur ? `Pin ${cur[0]} → Pin ${cur[1]}` : "—"], ["Remaining", (seq.length - step).toLocaleString()]].map(([label, val]) => (
                    <div key={label} style={{ background: "#f7f8fa", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", color: "#bbb", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "#1a1a2e" }}>{val}</div>
                    </div>
                  ))}
                </div>
                <input type="range" min={0} max={seq.length} value={step} onChange={e => setStep(Number(e.target.value))} style={{ width: "100%", marginBottom: 14, accentColor: "#1a1a2e" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 14 }}>
                  <button onClick={() => setStep(s => Math.max(0, s-1))} style={{ width: 52, height: 52, borderRadius: 12, border: "1.5px solid #e0e3e8", background: "#f7f8fa", fontSize: 20, cursor: "pointer" }}>⏮</button>
                  <button onClick={() => setPlaying(p => !p)} style={{ width: 68, height: 68, borderRadius: 16, border: "none", background: "#1a1a2e", color: "#fff", fontSize: 26, cursor: "pointer" }}>{playing ? "⏸" : "▶"}</button>
                  <button onClick={() => setStep(s => Math.min(seq.length, s+1))} style={{ width: 52, height: 52, borderRadius: 12, border: "1.5px solid #e0e3e8", background: "#f7f8fa", fontSize: 20, cursor: "pointer" }}>⏭</button>
                  <button onClick={() => { setPlaying(false); setStep(0); }} style={{ width: 52, height: 52, borderRadius: 12, border: "1.5px solid #e0e3e8", background: "#f7f8fa", fontSize: 20, cursor: "pointer" }}>🔄</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#f7f8fa", borderRadius: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: "#555" }}>Step every</span>
                  <select value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))} style={{ padding: "8px 10px", border: "1px solid #e0e3e8", borderRadius: 8, fontSize: 14, fontFamily: "monospace", background: "#fff" }}>
                    {INTERVALS.map(s => <option key={s} value={s}>{s} second{s > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={jump} onChange={e => setJump(e.target.value)} placeholder="Jump to step #" inputMode="numeric" onKeyDown={e => e.key === "Enter" && setStep(Math.max(0, Math.min(seq.length, parseInt(jump,10)||0)))} style={{ flex: 1, padding: "12px 14px", border: "1.5px solid #e0e3e8", borderRadius: 10, fontSize: 15, fontFamily: "monospace", outline: "none" }} />
                  <button onClick={() => setStep(Math.max(0, Math.min(seq.length, parseInt(jump,10)||0)))} style={{ padding: "12px 18px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Go</button>
                </div>
              </>
            )}

            {tab === "input" && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Connection sequence</div>
                <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Accepts: <code style={{ background: "#f5f5f5", padding: "1px 4px", borderRadius: 3 }}>Step 1: PIN 54 to PIN 67</code>, <code style={{ background: "#f5f5f5", padding: "1px 4px", borderRadius: 3 }}>54 67</code>, or <code style={{ background: "#f5f5f5", padding: "1px 4px", borderRadius: 3 }}>54,67</code></p>
                <textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={"- Step 1: PIN 54 to PIN 67\n- Step 2: PIN 67 to PIN 50\nor simply: 54 67"} style={{ width: "100%", height: 200, border: "1.5px solid #ddd", borderRadius: 8, padding: 12, fontSize: 13, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
                {parseErr.length > 0 && (
                  <div style={{ background: "#fff0f0", border: "1px solid #ffcccc", borderRadius: 8, padding: 10, marginTop: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: "#c00", marginBottom: 6 }}>{parseErr.length} invalid row{parseErr.length > 1 ? "s" : ""}</div>
                    {parseErr.slice(0, 5).map((e, i) => <div key={i} style={{ color: "#900", marginBottom: 2 }}>Line {e.line}: {e.reason}</div>)}
                  </div>
                )}
                <button onClick={loadSeq} style={{ width: "100%", marginTop: 12, padding: 14, background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
                  Load {parseSequence(raw).seq.length.toLocaleString()} connections
                </button>
              </>
            )}

            {tab === "stats" && seq.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Statistics</div>
                {[["Total lines", seq.length.toLocaleString()], ["Current step", step.toLocaleString()], ["Remaining", (seq.length - step).toLocaleString()]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f5f5f5", fontSize: 13 }}>
                    <span style={{ color: "#888" }}>{k}</span><span style={{ fontWeight: 600, fontFamily: "monospace" }}>{v}</span>
                  </div>
                ))}
              </>
            )}

            {tab === "io" && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Import</div>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 68, border: "1.5px dashed #ddd", borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer", marginBottom: 20 }}>
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
                  Drop or choose — TXT, CSV, or JSON
                </label>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Export</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                  {["txt","csv","json"].map(fmt => (
                    <button key={fmt} onClick={() => {
                      const content = fmt === "json" ? JSON.stringify({ pins: PIN_COUNT, sequence: seq }, null, 2) : fmt === "csv" ? "from,to\n" + seq.map(([a,b]) => `${a},${b}`).join("\n") : seq.map(([a,b]) => `${a} ${b}`).join("\n");
                      const blob = new Blob([content], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = project.name.replace(/\s+/g,"_") + "." + fmt; a.click();
                    }} style={{ padding: "10px 0", border: "1px solid #e0e3e8", background: "#f5f5f5", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>{fmt.toUpperCase()}</button>
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
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f8fa", fontFamily: "system-ui,sans-serif", color: "#aaa" }}>Loading…</div>;
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

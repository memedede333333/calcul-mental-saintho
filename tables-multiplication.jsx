import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700;800&display=swap');

.tm-root {
  --ink:#3A2E5C; --ink-soft:#7A6E9E;
  --rasp:#FF4D74; --rasp-dk:#E03662;
  --mint:#1FBE86; --mint-dk:#15A674;
  --sun:#FFC23C; --sun-dk:#F0A91F;
  --sky:#3E9BEE; --sky-dk:#2A80D4;
  --purple:#9B6BF2; --purple-dk:#7B4FD0;
  --surface:#FFFFFF; --soft:#F4EFFA;
  --bg1:#FFF4E6; --bg2:#FCE7F0;
  font-family:'Nunito', system-ui, sans-serif;
  color:var(--ink); min-height:100vh;
  background:linear-gradient(160deg, var(--bg1), var(--bg2));
  display:flex; justify-content:center;
  padding:18px 14px 40px; box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;
}
.tm-root *{ box-sizing:border-box; }
.tm-stage{ width:100%; max-width:540px; }
.tm-display{ font-family:'Baloo 2', system-ui, sans-serif; }
.tm-h1{ font-family:'Baloo 2', system-ui, sans-serif; font-weight:800;
  font-size:clamp(30px,9vw,44px); line-height:1; margin:0; letter-spacing:-.5px; }
.tm-sub{ color:var(--ink-soft); font-weight:700; margin:6px 0 0; font-size:15px; }
.tm-card{ background:var(--surface); border-radius:26px; padding:22px;
  box-shadow:0 14px 32px rgba(58,46,92,.10); }
.tm-modecard{ display:flex; gap:16px; align-items:center; width:100%; text-align:left;
  border:none; cursor:pointer; border-radius:26px; padding:20px 22px; margin-top:16px;
  color:#fff; box-shadow:0 12px 26px rgba(58,46,92,.18); transition:transform .12s ease; }
.tm-modecard:hover{ transform:translateY(-3px); }
.tm-modecard:active{ transform:translateY(0) scale(.99); }
.tm-mc-learn{ background:linear-gradient(135deg,var(--sky),var(--sky-dk)); }
.tm-mc-play{ background:linear-gradient(135deg,var(--rasp),var(--rasp-dk)); }
.tm-mc-emoji{ font-size:40px; line-height:1; }
.tm-mc-title{ font-family:'Baloo 2',sans-serif; font-weight:800; font-size:23px; }
.tm-mc-desc{ font-weight:700; opacity:.92; font-size:14px; margin-top:2px; }
.tm-btn{ font-family:'Baloo 2',sans-serif; font-weight:700; border:none; cursor:pointer;
  border-radius:18px; padding:14px 20px; font-size:18px; color:#fff;
  transition:transform .1s ease; }
.tm-btn:active{ transform:scale(.96); }
.tm-btn:disabled{ opacity:.45; cursor:default; }
.tm-btn-rasp{ background:var(--rasp); box-shadow:0 8px 16px rgba(255,77,116,.35); }
.tm-btn-mint{ background:var(--mint); box-shadow:0 8px 16px rgba(31,190,134,.32); }
.tm-btn-sky{ background:var(--sky); box-shadow:0 8px 16px rgba(62,155,238,.32); }
.tm-btn-purple{ background:var(--purple); box-shadow:0 8px 16px rgba(155,107,242,.32); }
.tm-btn-ghost{ background:var(--soft); color:var(--ink); box-shadow:none; }
.tm-back{ background:none; border:none; cursor:pointer; color:var(--ink-soft);
  font-family:'Baloo 2',sans-serif; font-weight:700; font-size:16px; padding:6px 4px;
  display:inline-flex; align-items:center; gap:6px; margin-bottom:10px; }
.tm-back:active{ transform:scale(.96); }
.tm-chips{ display:flex; flex-wrap:wrap; gap:10px; }
.tm-chip{ font-family:'Baloo 2',sans-serif; font-weight:700; font-size:20px;
  width:52px; height:52px; border-radius:16px; border:2px solid #ECE4F6; background:#fff;
  color:var(--ink); cursor:pointer; transition:transform .1s ease; }
.tm-chip:active{ transform:scale(.92); }
.tm-chip.on-sky{ background:var(--sky); border-color:var(--sky); color:#fff; }
.tm-chip.on-rasp{ background:var(--rasp); border-color:var(--rasp); color:#fff; }
.tm-chip.on-purple{ background:var(--purple); border-color:var(--purple); color:#fff; }
.tm-row{ display:flex; align-items:center; justify-content:space-between;
  padding:13px 16px; border-radius:16px; background:var(--soft); margin-bottom:9px;
  cursor:pointer; font-family:'Baloo 2',sans-serif; transition:transform .1s ease; }
.tm-row:active{ transform:scale(.985); }
.tm-row.focus{ background:#E4F0FE; outline:2px solid var(--sky); }
.tm-row-expr{ font-size:20px; font-weight:700; }
.tm-row-res{ font-size:24px; font-weight:800; color:var(--sky-dk); min-width:54px; text-align:right; }
.tm-row-q{ color:var(--sky); }

/* Viz tabs */
.tm-tabs{ display:flex; gap:6px; margin:12px 0; }
.tm-tab{ flex:1; font-family:'Baloo 2',sans-serif; font-weight:700; font-size:13px;
  border:2px solid #ECE4F6; background:#fff; color:var(--ink-soft); border-radius:14px;
  padding:8px 4px; cursor:pointer; transition:all .15s ease; }
.tm-tab.active{ background:var(--sky); border-color:var(--sky); color:#fff; }

/* Arrays & groups */
.tm-array{ display:grid; gap:7px; justify-content:center; padding:6px; }
.tm-dot{ width:16px; height:16px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%, #7BBBF4, var(--sky-dk)); }
.tm-group-wrap{ display:flex; flex-wrap:wrap; gap:14px; justify-content:center; padding:10px 0; }
.tm-group{ display:flex; flex-wrap:wrap; gap:5px; background:#EDF5FF; border:2px dashed var(--sky);
  border-radius:14px; padding:10px; justify-content:center; }
.tm-group-item{ width:22px; height:22px; border-radius:50%;
  background:radial-gradient(circle at 35% 30%, #FFDA6A, var(--sun-dk)); }

/* Bar model */
.tm-bar-wrap{ padding:10px 0; }
.tm-bar-row{ display:flex; gap:3px; margin-bottom:8px; }
.tm-bar-cell{ flex:1; height:36px; border-radius:8px; display:flex; align-items:center;
  justify-content:center; font-family:'Baloo 2',sans-serif; font-weight:800; font-size:14px; color:#fff; }
.tm-bar-total{ text-align:center; font-family:'Baloo 2',sans-serif; font-weight:800;
  font-size:20px; color:var(--ink); margin-top:4px; }

/* Skip counting */
.tm-skip{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; padding:8px 0; }
.tm-skip-num{ font-family:'Baloo 2',sans-serif; font-weight:800; font-size:20px;
  width:44px; height:44px; display:flex; align-items:center; justify-content:center;
  border-radius:12px; background:var(--soft); color:var(--ink); }
.tm-skip-num.hl{ background:var(--sky); color:#fff; }

/* Tips */
.tm-tip{ background:#FFF8E1; border-left:4px solid var(--sun); border-radius:0 14px 14px 0;
  padding:12px 16px; margin-top:12px; font-weight:700; font-size:14px; line-height:1.5; }
.tm-tip b{ color:var(--sun-dk); }

/* Commutative toggle */
.tm-comm{ display:flex; align-items:center; gap:8px; font-family:'Baloo 2',sans-serif;
  font-weight:700; font-size:15px; margin:8px 0; color:var(--ink-soft); cursor:pointer; }
.tm-comm input{ width:18px; height:18px; accent-color:var(--purple); }

/* Mastery grid */
.tm-mgrid{ display:grid; grid-template-columns:28px repeat(10,1fr); gap:3px; font-size:11px;
  font-family:'Baloo 2',sans-serif; font-weight:700; }
.tm-mgrid-hdr{ display:flex; align-items:center; justify-content:center; color:var(--ink-soft); font-size:11px; }
.tm-mgrid-cell{ aspect-ratio:1; border-radius:6px; display:flex; align-items:center;
  justify-content:center; font-size:10px; color:#fff; transition:background .3s ease; }

/* Keypad */
.tm-keypad{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:18px; }
.tm-key{ font-family:'Baloo 2',sans-serif; font-weight:800; font-size:26px;
  border:none; cursor:pointer; border-radius:20px; padding:18px 0; background:#fff;
  color:var(--ink); box-shadow:0 5px 0 #EBE3F5; transition:transform .06s ease, box-shadow .06s ease; }
.tm-key:active{ transform:translateY(4px); box-shadow:0 1px 0 #EBE3F5; }
.tm-key-go{ background:var(--mint); color:#fff; box-shadow:0 5px 0 var(--mint-dk); }
.tm-key-del{ background:#FFE7DE; color:var(--rasp-dk); box-shadow:0 5px 0 #F6CFC2; }
.tm-key-hint{ background:#F0E8FF; color:var(--purple); box-shadow:0 5px 0 #D9CBF0; font-size:18px; }

.tm-question{ font-family:'Baloo 2',sans-serif; font-weight:800;
  font-size:clamp(44px,15vw,68px); text-align:center; letter-spacing:-1px; }
.tm-answerbox{ font-family:'Baloo 2',sans-serif; font-weight:800; font-size:40px;
  text-align:center; min-height:64px; line-height:64px; border-radius:18px;
  background:var(--soft); margin-top:6px; transition:background .15s ease, color .15s ease; }
.tm-answerbox.good{ background:#D8F6EA; color:var(--mint-dk); }
.tm-answerbox.bad{ background:#FFE0E7; color:var(--rasp-dk); }
.tm-caret{ display:inline-block; width:3px; height:38px; vertical-align:-6px;
  background:var(--ink-soft); margin-left:2px; animation:tm-blink 1s steps(1) infinite; }
.tm-hintbox{ background:#F0E8FF; border-radius:14px; padding:12px 16px; margin-top:10px;
  font-family:'Baloo 2',sans-serif; font-weight:700; font-size:15px; color:var(--purple-dk);
  text-align:center; line-height:1.6; }
.tm-progress{ height:12px; border-radius:8px; background:var(--soft); overflow:hidden; }
.tm-progress > i{ display:block; height:100%; background:linear-gradient(90deg,var(--sun),var(--sun-dk)); transition:width .3s ease; }
.tm-pill{ display:inline-flex; align-items:center; gap:6px; font-family:'Baloo 2',sans-serif;
  font-weight:800; font-size:16px; padding:7px 14px; border-radius:999px; background:var(--soft); }
.tm-stars{ font-size:46px; letter-spacing:6px; text-align:center; }
.tm-statgrid{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:18px 0; }
.tm-stat{ background:var(--soft); border-radius:18px; padding:14px 8px; text-align:center; }
.tm-stat b{ font-family:'Baloo 2',sans-serif; font-size:26px; display:block; }
.tm-stat span{ font-weight:700; font-size:12px; color:var(--ink-soft); }
.tm-feedword{ font-family:'Baloo 2',sans-serif; font-weight:800; text-align:center;
  font-size:22px; height:28px; }
.tm-timer-ring{ position:relative; display:inline-flex; align-items:center; justify-content:center; }
.tm-timer-ring svg{ transform:rotate(-90deg); }
.tm-timer-ring .tm-timer-txt{ position:absolute; font-family:'Baloo 2',sans-serif;
  font-weight:800; font-size:15px; color:var(--ink); }
.tm-timer-ring.tm-timer-warn .tm-timer-txt{ color:var(--rasp-dk); }
.tm-timer-ring.tm-timer-warn circle.tm-ring-fg{ stroke:var(--rasp); }

@keyframes tm-blink{ 50%{opacity:0;} }
@keyframes tm-pop{ 0%{transform:scale(1);} 40%{transform:scale(1.07);} 100%{transform:scale(1);} }
@keyframes tm-shake{ 0%,100%{transform:translateX(0);} 20%{transform:translateX(-9px);} 40%{transform:translateX(8px);} 60%{transform:translateX(-6px);} 80%{transform:translateX(4px);} }
@keyframes tm-fade{ from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:translateY(0);} }
.tm-anim-pop{ animation:tm-pop .4s ease; }
.tm-anim-shake{ animation:tm-shake .45s ease; }
.tm-screen{ animation:tm-fade .25s ease; }
@media (prefers-reduced-motion: reduce){
  .tm-anim-pop,.tm-anim-shake,.tm-screen,.tm-modecard,.tm-btn,.tm-key{ animation:none !important; transition:none !important; }
}
`;

const TABLES = [1,2,3,4,5,6,7,8,9,10];
const PRAISE = ["Bravo !","Super !","Génial !","Parfait !","Bien vu !","Champion !"];
const BAR_COLORS = ["#3E9BEE","#FF4D74","#1FBE86","#FFC23C","#9B6BF2","#FF8C42","#E03662","#2A80D4","#15A674","#F0A91F"];

/* Tips for hard tables — Singapore-style mental strategies */
const TIPS = {
  2: "Multiplier par 2 = doubler le nombre. Ex : 7×2 = 7+7 = 14",
  3: "Astuce : double + une fois. Ex : 3×6 = 2×6 + 6 = 12+6 = 18",
  4: "Multiplier par 4 = doubler deux fois. Ex : 4×7 = 2×7 = 14, puis 2×14 = 28",
  5: "Multiplier par 5 : divise par 2 puis ×10. Ex : 5×8 = 8÷2 ×10 = 40",
  6: "×6 = ×5 + une fois. Ex : 6×7 = 5×7 + 7 = 35+7 = 42",
  7: "×7 = ×5 + ×2. Ex : 7×8 = 5×8 + 2×8 = 40+16 = 56",
  8: "×8 = doubler 3 fois. Ex : 8×6 = 2×6=12, 2×12=24, 2×24=48",
  9: "Astuce des doigts : baisse le doigt n°N. Ex : 9×4 → baisse doigt 4 → 3|6 = 36",
  10: "Ajoute un zéro ! Ex : 10×7 = 70",
};

function makeHint(a, b) {
  const ans = a * b;
  if (a === 1 || b === 1) return `Tout nombre × 1 = lui-même → ${ans}`;
  if (a === 10 || b === 10) { const o = a===10?b:a; return `${o} × 10 = ajoute un 0 → ${ans}`; }
  if (a === 2 || b === 2) { const o = a===2?b:a; return `Double de ${o} → ${o}+${o} = ${ans}`; }
  if (a === 5 || b === 5) { const o = a===5?b:a; return `${o} × 5 = ${o}÷2 × 10 → ${o%2===0 ? o/2 : o+' → '+o*5/10+'…'} → ${ans}`; }
  if (a === 9 || b === 9) { const o = a===9?b:a; return `${o} × 9 = ${o}×10 - ${o} = ${o*10}-${o} = ${ans}`; }
  if (a === 4 || b === 4) { const o = a===4?b:a; return `${o} × 4 = double de double → 2×${o}=${2*o}, 2×${2*o}=${ans}`; }
  const small = Math.min(a,b), big = Math.max(a,b);
  return `${small} × ${big} = ${small}×${big-1} + ${small} = ${small*(big-1)}+${small} = ${ans}`;
}

/* Adaptive question selection with weighted probabilities */
function newQuestion(tables, prev, weights) {
  const pool = [];
  for (const t of tables) {
    for (let m = 1; m <= 10; m++) {
      const key = `${Math.min(t,m)}_${Math.max(t,m)}`;
      const w = (weights && weights[key]) || 1;
      for (let i = 0; i < w; i++) pool.push({ a: t, b: m, answer: t * m });
    }
  }
  let q, tries = 0;
  do {
    q = pool[Math.floor(Math.random() * pool.length)];
    tries++;
  } while (prev && q.a === prev.a && q.b === prev.b && tries < 15);
  return q;
}

/* Mastery color */
function masteryColor(val) {
  if (val === undefined) return "#ECE4F6";
  if (val >= 3) return "#1FBE86";
  if (val >= 1) return "#FFC23C";
  if (val >= 0) return "#FFB0C0";
  return "#FF4D74";
}

export default function App() {
  const [screen, setScreen] = useState("home");
  return (
    <div className="tm-root">
      <style>{CSS}</style>
      <div className="tm-stage">
        {screen === "home" && <Home onGo={setScreen} />}
        {screen === "learn" && <Learn onBack={() => setScreen("home")} />}
        {screen === "play" && <Practice onBack={() => setScreen("home")} />}
      </div>
    </div>
  );
}

function Home({ onGo }) {
  return (
    <div className="tm-screen" style={{ paddingTop: 12 }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 52, lineHeight: 1 }}>✖️</div>
        <h1 className="tm-h1" style={{ marginTop: 6 }}>Les Tables</h1>
        <p className="tm-sub">Méthode Singapour : comprendre, voir, maîtriser</p>
      </div>
      <button className="tm-modecard tm-mc-learn" onClick={() => onGo("learn")}>
        <span className="tm-mc-emoji">📘</span>
        <span><div className="tm-mc-title">Apprendre</div>
          <div className="tm-mc-desc">Groupes, tableaux, barres et astuces</div></span>
      </button>
      <button className="tm-modecard tm-mc-play" onClick={() => onGo("play")}>
        <span className="tm-mc-emoji">🚀</span>
        <span><div className="tm-mc-title">S'entraîner</div>
          <div className="tm-mc-desc">Quiz adaptatif avec indices et maîtrise</div></span>
      </button>
    </div>
  );
}

/* ===================== LEARN ===================== */
function Learn({ onBack }) {
  const [table, setTable] = useState(2);
  const [focus, setFocus] = useState(3);
  const [hide, setHide] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [viz, setViz] = useState("groups"); // groups | array | bar
  const [flipped, setFlipped] = useState(false); // commutative

  useEffect(() => setRevealed({}), [table, hide]);

  const reveal = (m) => { setFocus(m); if (hide) setRevealed((r) => ({ ...r, [m]: true })); };
  const a = flipped ? focus : table;
  const b = flipped ? table : focus;

  return (
    <div className="tm-screen">
      <button className="tm-back" onClick={onBack}>‹ Accueil</button>

      <div className="tm-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 className="tm-display" style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            Table de {table}
          </h2>
          <button className="tm-btn tm-btn-ghost" style={{ fontSize: 14, padding: "8px 14px" }}
            onClick={() => setHide((h) => !h)}>
            {hide ? "👁 Montrer" : "🙈 Cacher"}
          </button>
        </div>
        <div className="tm-chips" style={{ margin: "14px 0 4px" }}>
          {TABLES.map((t) => (
            <button key={t} className={"tm-chip" + (t === table ? " on-sky" : "")}
              onClick={() => { setTable(t); setFocus(3); setFlipped(false); }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Table list */}
      <div className="tm-card" style={{ marginTop: 16 }}>
        {TABLES.map((m) => {
          const show = !hide || revealed[m];
          return (
            <div key={m} className={"tm-row" + (m === focus ? " focus" : "")}
              onClick={() => reveal(m)}>
              <span className="tm-row-expr">{table} × {m}</span>
              <span className={"tm-row-res" + (show ? "" : " tm-row-q")}>
                {show ? table * m : "?"}</span>
            </div>
          );
        })}
      </div>

      {/* Skip counting */}
      <div className="tm-card" style={{ marginTop: 16 }}>
        <p className="tm-display" style={{ fontWeight: 800, fontSize: 18, margin: "0 0 6px" }}>
          🔢 Comptage par sauts de {table}
        </p>
        <div className="tm-skip">
          {TABLES.map((m) => (
            <span key={m} className={"tm-skip-num" + (m <= focus ? " hl" : "")}
              onClick={() => { reveal(m); }}>{table * m}</span>
          ))}
        </div>
        <p className="tm-sub" style={{ textAlign: "center" }}>
          Touche un nombre pour explorer
        </p>
      </div>

      {/* CPA Visualization */}
      <div className="tm-card" style={{ marginTop: 16 }}>
        <p className="tm-display" style={{ fontWeight: 800, fontSize: 18, margin: "0 0 2px" }}>
          👁 Visualiser {a} × {b} = {a * b}
        </p>

        {/* Commutative toggle */}
        <label className="tm-comm" onClick={() => setFlipped(f => !f)}>
          <input type="checkbox" checked={flipped} readOnly />
          Commutativité : {table}×{focus} = {focus}×{table}
        </label>

        {/* Viz tabs */}
        <div className="tm-tabs">
          <button className={"tm-tab" + (viz === "groups" ? " active" : "")} onClick={() => setViz("groups")}>
            Groupes
          </button>
          <button className={"tm-tab" + (viz === "array" ? " active" : "")} onClick={() => setViz("array")}>
            Tableau
          </button>
          <button className={"tm-tab" + (viz === "bar" ? " active" : "")} onClick={() => setViz("bar")}>
            Barre
          </button>
        </div>

        {viz === "groups" && <GroupsViz a={a} b={b} />}
        {viz === "array" && <ArrayViz cols={a} rows={b} />}
        {viz === "bar" && <BarViz a={a} b={b} />}
      </div>

      {/* Strategy tip */}
      {TIPS[table] && (
        <div className="tm-tip">
          <b>💡 Astuce × {table} :</b> {TIPS[table]}
        </div>
      )}
    </div>
  );
}

function GroupsViz({ a, b }) {
  const groups = [];
  for (let g = 0; g < a; g++) {
    const items = [];
    for (let i = 0; i < b; i++) items.push(<span key={i} className="tm-group-item" />);
    groups.push(
      <div key={g} className="tm-group" style={{ maxWidth: Math.min(b, 5) * 30 + 20 }}>
        {items}
      </div>
    );
  }
  return (
    <div>
      <div className="tm-group-wrap">{groups}</div>
      <p className="tm-sub" style={{ textAlign: "center", margin: "6px 0 0" }}>
        {a} groupe{a > 1 ? "s" : ""} de {b} = {a * b}
      </p>
    </div>
  );
}

function ArrayViz({ cols, rows }) {
  const dots = [];
  for (let i = 0; i < cols * rows; i++) dots.push(i);
  const size = cols > 8 ? 13 : 16;
  return (
    <div>
      <div className="tm-array" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}>
        {dots.map((i) => <span key={i} className="tm-dot" style={{ width: size, height: size }} />)}
      </div>
      <p className="tm-sub" style={{ textAlign: "center", margin: "6px 0 0" }}>
        {rows} ligne{rows > 1 ? "s" : ""} × {cols} colonne{cols > 1 ? "s" : ""} = {cols * rows}
      </p>
    </div>
  );
}

function BarViz({ a, b }) {
  const rows = [];
  for (let r = 0; r < a; r++) {
    const cells = [];
    for (let c = 0; c < b; c++) {
      cells.push(
        <div key={c} className="tm-bar-cell" style={{ background: BAR_COLORS[r % BAR_COLORS.length] }}>
          {b <= 10 ? c + 1 + r * b : ""}
        </div>
      );
    }
    rows.push(<div key={r} className="tm-bar-row">{cells}</div>);
  }
  return (
    <div className="tm-bar-wrap">
      {rows}
      <div className="tm-bar-total">
        {a} × {b} = {a * b}
      </div>
    </div>
  );
}

/* ===================== PRACTICE ===================== */
function Practice({ onBack }) {
  const [phase, setPhase] = useState("setup");
  const [picked, setPicked] = useState([2, 3, 4, 5]);
  const [length, setLength] = useState(10);
  const [timer, setTimer] = useState(0);
  const [result, setResult] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [mastery, setMastery] = useState({});

  const updateMastery = (wrong, right) => {
    setMastery(prev => {
      const m = { ...prev };
      for (const w of wrong) {
        const key = `${Math.min(w.a, w.b)}_${Math.max(w.a, w.b)}`;
        m[key] = Math.max((m[key] || 0) - 1, -2);
      }
      for (const r of right) {
        const key = `${Math.min(r.a, r.b)}_${Math.max(r.a, r.b)}`;
        m[key] = Math.min((m[key] || 0) + 1, 4);
      }
      return m;
    });
  };

  const start = (tables, len) => {
    setPicked(tables);
    setLength(len);
    setPhase("quiz");
  };

  if (phase === "setup")
    return (
      <>
        {showGrid && <MasteryGrid mastery={mastery} onClose={() => setShowGrid(false)} />}
        <Setup onBack={onBack} picked={picked} setPicked={setPicked}
          length={length} setLength={setLength} timer={timer} setTimer={setTimer}
          onStart={() => setPhase("quiz")} onShowGrid={() => setShowGrid(true)} />
      </>
    );

  if (phase === "quiz")
    return (
      <Quiz tables={picked.length ? picked : TABLES}
        length={timer > 0 ? 0 : length} timer={timer} mastery={mastery}
        onQuit={() => setPhase("setup")}
        onDone={(r) => { updateMastery(r.wrong, r.right); setResult(r); setPhase("results"); }}
      />
    );

  return (
    <Results result={result}
      onReplay={() => setPhase("quiz")}
      onReviewErrors={(tables) => start(tables, 10)}
      onHome={onBack} onSetup={() => setPhase("setup")} />
  );
}

function MasteryGrid({ mastery, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(58,46,92,.6)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div className="tm-card" style={{ maxWidth: 420, width: "100%" }}
        onClick={e => e.stopPropagation()}>
        <h3 className="tm-display" style={{ fontWeight: 800, fontSize: 20, margin: "0 0 12px" }}>
          🗺 Grille de maîtrise
        </h3>
        <div className="tm-mgrid">
          <div className="tm-mgrid-hdr">×</div>
          {TABLES.map(c => <div key={c} className="tm-mgrid-hdr">{c}</div>)}
          {TABLES.map(r => (
            <React.Fragment key={r}>
              <div className="tm-mgrid-hdr">{r}</div>
              {TABLES.map(c => {
                const key = `${Math.min(r,c)}_${Math.max(r,c)}`;
                return (
                  <div key={c} className="tm-mgrid-cell"
                    style={{ background: masteryColor(mastery[key]) }}>
                    {r * c}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14, fontSize: 12, fontWeight: 700 }}>
          <span>🔴 À revoir</span><span>🟡 En cours</span><span>🟢 Maîtrisé</span><span>⬜ Pas testé</span>
        </div>
        <button className="tm-btn tm-btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

function Setup({ onBack, picked, setPicked, length, setLength, timer, setTimer, onStart, onShowGrid }) {
  const toggle = (t) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const all = picked.length === TABLES.length;
  const timerOn = timer > 0;

  return (
    <div className="tm-screen">
      <button className="tm-back" onClick={onBack}>‹ Accueil</button>
      <div className="tm-card">
        <h2 className="tm-display" style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Choisis tes tables</h2>
        <div className="tm-chips" style={{ margin: "14px 0" }}>
          {TABLES.map((t) => (
            <button key={t} className={"tm-chip" + (picked.includes(t) ? " on-rasp" : "")}
              onClick={() => toggle(t)}>{t}</button>
          ))}
        </div>
        <button className="tm-btn tm-btn-ghost" style={{ fontSize: 15, padding: "10px 16px" }}
          onClick={() => setPicked(all ? [] : [...TABLES])}>
          {all ? "Tout décocher" : "Tout choisir"}
        </button>
      </div>

      <div className="tm-card" style={{ marginTop: 16 }}>
        <h2 className="tm-display" style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 800 }}>Combien de questions ?</h2>
        <div style={{ display: "flex", gap: 10, opacity: timerOn ? .35 : 1, pointerEvents: timerOn ? "none" : "auto" }}>
          {[{v:10,l:"10"},{v:20,l:"20"},{v:0,l:"∞"}].map((o) => (
            <button key={o.v} onClick={() => setLength(o.v)}
              className={"tm-chip" + (length === o.v && !timerOn ? " on-rasp" : "")}
              style={{ flex: 1, width: "auto" }}>{o.l}</button>
          ))}
        </div>
        {timerOn && <p className="tm-sub" style={{ textAlign: "center", margin: "8px 0 0" }}>Le chrono remplace le nombre de questions</p>}
      </div>

      <div className="tm-card" style={{ marginTop: 16 }}>
        <h2 className="tm-display" style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 800 }}>⏱ Chrono</h2>
        <div style={{ display: "flex", gap: 10 }}>
          {[{v:0,l:"Non"},{v:60,l:"1 min"},{v:120,l:"2 min"},{v:180,l:"3 min"}].map((o) => (
            <button key={o.v} onClick={() => setTimer(o.v)}
              className={"tm-chip" + (timer === o.v ? " on-rasp" : "")}
              style={{ flex: 1, width: "auto", fontSize: 16 }}>{o.l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
        <button className="tm-btn tm-btn-rasp" style={{ flex: 1, fontSize: 22, padding: 16 }}
          disabled={picked.length === 0} onClick={onStart}>C'est parti ! 🚀</button>
        <button className="tm-btn tm-btn-purple" style={{ padding: "16px 18px", fontSize: 20 }}
          onClick={onShowGrid} title="Grille de maîtrise">🗺</button>
      </div>
      {picked.length === 0 && <p className="tm-sub" style={{ textAlign: "center" }}>Choisis au moins une table.</p>}
    </div>
  );
}

/* ===================== QUIZ ===================== */
function Quiz({ tables, length, timer, mastery, onQuit, onDone }) {
  // Build adaptive weights from mastery data
  const weights = useMemo(() => {
    const w = {};
    for (const t of tables) {
      for (let m = 1; m <= 10; m++) {
        const key = `${Math.min(t,m)}_${Math.max(t,m)}`;
        const val = mastery[key];
        if (val === undefined) w[key] = 2; // unknown → medium priority
        else if (val <= 0) w[key] = 4;     // weak → high priority
        else if (val <= 2) w[key] = 2;     // learning → medium
        else w[key] = 1;                   // mastered → low
      }
    }
    return w;
  }, [tables, mastery]);

  const [sessionWeights, setSessionWeights] = useState(weights);
  const [q, setQ] = useState(() => newQuestion(tables, null, weights));
  const [input, setInput] = useState("");
  const [answered, setAnswered] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [fb, setFb] = useState("idle");
  const [word, setWord] = useState("");
  const [remaining, setRemaining] = useState(timer);
  const [showHint, setShowHint] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const lockRef = useRef(false);
  const wrongRef = useRef([]);
  const rightRef = useRef([]);
  const startRef = useRef(Date.now());
  const scoreRef = useRef(0);
  const answeredRef = useRef(0);
  const maxStreakRef = useRef(0);
  const timedOut = useRef(false);
  const endless = length === 0;
  const hasTimer = timer > 0;

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { answeredRef.current = answered; }, [answered]);
  useEffect(() => { maxStreakRef.current = maxStreak; }, [maxStreak]);

  useEffect(() => {
    if (!hasTimer) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!timedOut.current) {
            timedOut.current = true;
            setTimeout(() => {
              onDone({ score: scoreRef.current, answered: answeredRef.current,
                maxStreak: maxStreakRef.current, wrong: wrongRef.current, right: rightRef.current,
                seconds: timer, timerMode: true });
            }, 0);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [hasTimer, timer, onDone]);

  const finish = useCallback(() => {
    onDone({ score, answered: endless ? answered : length, maxStreak,
      wrong: wrongRef.current, right: rightRef.current,
      seconds: Math.round((Date.now() - startRef.current) / 1000), timerMode: hasTimer });
  }, [score, answered, length, maxStreak, endless, hasTimer, onDone]);

  const submit = useCallback(() => {
    if (lockRef.current || input === "" || timedOut.current) return;
    lockRef.current = true;
    const ok = parseInt(input, 10) === q.answer;
    const nextAnswered = answered + 1;
    setAnswered(nextAnswered);

    if (ok) {
      setScore(s => s + 1);
      setStreak(s => { const n = s + 1; setMaxStreak(m => Math.max(m, n)); return n; });
      setFb("correct");
      setWord(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
      rightRef.current.push({ a: q.a, b: q.b });
    } else {
      setStreak(0);
      wrongRef.current.push({ a: q.a, b: q.b, answer: q.answer, given: input });
      setFb("wrong");
      setWord(`${q.a} × ${q.b} = ${q.answer}`);
      // Boost weight for missed fact
      const key = `${Math.min(q.a,q.b)}_${Math.max(q.a,q.b)}`;
      setSessionWeights(w => ({ ...w, [key]: Math.min((w[key] || 1) + 3, 8) }));
    }

    const delay = ok ? 700 : 1500;
    setTimeout(() => {
      if (timedOut.current) return;
      lockRef.current = false;
      setFb("idle"); setWord(""); setInput(""); setShowHint(false); setHintUsed(false);
      if (!endless && nextAnswered >= length) {
        onDone({ score: ok ? score + 1 : score, answered: length,
          maxStreak: Math.max(maxStreak, ok ? streak + 1 : 0),
          wrong: wrongRef.current, right: rightRef.current,
          seconds: Math.round((Date.now() - startRef.current) / 1000) });
      } else {
        setQ(prev => newQuestion(tables, prev, sessionWeights));
      }
    }, delay);
  }, [input, q, answered, endless, length, score, maxStreak, streak, tables, sessionWeights, onDone]);

  const press = (d) => { if (!lockRef.current && input.length < 3) setInput(v => v + d); };
  const del = () => { if (!lockRef.current) setInput(v => v.slice(0, -1)); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") del();
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, input]);

  const pct = endless ? 0 : (answered / length) * 100;
  const timerPct = hasTimer ? remaining / timer : 1;
  const timerWarn = hasTimer && remaining <= 10;

  return (
    <div className="tm-screen">
      <button className="tm-back" onClick={onQuit}>‹ Quitter</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className="tm-pill">⭐ {score}</span>
        <span className="tm-pill">🔥 {streak}</span>
        {hasTimer ? (
          <TimerRing seconds={remaining} total={timer} warn={timerWarn} />
        ) : (
          <span className="tm-pill">{endless ? `# ${answered}` : `${answered}/${length}`}</span>
        )}
      </div>

      {!endless && !hasTimer && <div className="tm-progress" style={{ marginBottom: 16 }}><i style={{ width: `${pct}%` }} /></div>}
      {hasTimer && <div className="tm-progress" style={{ marginBottom: 16 }}>
        <i style={{ width: `${timerPct * 100}%`, background: timerWarn ? "linear-gradient(90deg,var(--rasp),var(--rasp-dk))" : undefined, transition: "width 1s linear" }} />
      </div>}

      <div className={"tm-card" + (fb === "wrong" ? " tm-anim-shake" : fb === "correct" ? " tm-anim-pop" : "")}>
        <div className="tm-question">{q.a} × {q.b}</div>
        <div className={"tm-answerbox" + (fb === "correct" ? " good" : fb === "wrong" ? " bad" : "")}>
          {input === "" && fb === "idle" ? <span className="tm-caret" /> : input || "—"}
        </div>
        <div className="tm-feedword" style={{ marginTop: 10, color: fb === "wrong" ? "var(--rasp-dk)" : "var(--mint-dk)" }}>
          {word}
        </div>
        {showHint && fb === "idle" && (
          <div className="tm-hintbox">💡 {makeHint(q.a, q.b)}</div>
        )}
      </div>

      <div className="tm-keypad">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} className="tm-key" onClick={() => press(String(n))}>{n}</button>
        ))}
        <button className="tm-key tm-key-del" onClick={del}>⌫</button>
        <button className="tm-key" onClick={() => press("0")}>0</button>
        <button className="tm-key tm-key-go" onClick={submit}>✓</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        {!showHint && fb === "idle" && (
          <button className="tm-btn tm-btn-ghost" style={{ flex: 1, fontSize: 15 }}
            onClick={() => { setShowHint(true); setHintUsed(true); }}>
            💡 Indice
          </button>
        )}
        {endless && !hasTimer && (
          <button className="tm-btn tm-btn-ghost" style={{ flex: 1 }} onClick={finish}>Terminer</button>
        )}
      </div>
    </div>
  );
}

function TimerRing({ seconds, total, warn }) {
  const r = 22, c = 2 * Math.PI * r;
  const offset = c * (1 - seconds / total);
  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  return (
    <span className={"tm-timer-ring" + (warn ? " tm-timer-warn" : "")}>
      <svg width="54" height="54" viewBox="0 0 54 54">
        <circle cx="27" cy="27" r={r} fill="none" stroke="#ECE4F6" strokeWidth="5" />
        <circle className="tm-ring-fg" cx="27" cy="27" r={r} fill="none" stroke="var(--sky)"
          strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span className="tm-timer-txt">{fmt(seconds)}</span>
    </span>
  );
}

/* ===================== RESULTS ===================== */
function Results({ result, onReplay, onReviewErrors, onHome, onSetup }) {
  if (!result) return null;
  const { score, answered, maxStreak, wrong, seconds, timerMode } = result;
  const pct = answered ? Math.round((score / answered) * 100) : 0;
  const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
  const msg = stars === 3 ? "Champion des tables ! 🏆"
    : stars === 2 ? "Très bien joué !"
    : stars === 1 ? "Bon début, continue !"
    : "On retente ? Tu vas y arriver !";
  const wrongTables = [...new Set(wrong.map(w => w.a))].sort((a, b) => a - b);

  return (
    <div className="tm-screen">
      <div className="tm-card" style={{ textAlign: "center" }}>
        <div className="tm-stars">
          {"★".repeat(stars).padEnd(3, "☆").split("").map((s, i) => (
            <span key={i} style={{ color: s === "★" ? "var(--sun)" : "#E4DCF0" }}>{s}</span>
          ))}
        </div>
        <h2 className="tm-display" style={{ fontSize: 26, fontWeight: 800, margin: "8px 0 0" }}>{msg}</h2>
        <div className="tm-statgrid">
          <div className="tm-stat"><b style={{ color: "var(--mint-dk)" }}>{score}/{answered}</b><span>Bonnes réponses</span></div>
          <div className="tm-stat"><b style={{ color: "var(--rasp)" }}>{maxStreak}</b><span>Meilleure série</span></div>
          <div className="tm-stat">
            <b style={{ color: "var(--sky-dk)" }}>
              {timerMode ? `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}` : `${seconds}s`}
            </b>
            <span>{timerMode ? "Chrono" : "Temps total"}</span>
          </div>
        </div>
        {timerMode && answered > 0 && (
          <p className="tm-sub" style={{ textAlign: "center", margin: "0 0 14px" }}>
            ⚡ {(seconds / answered).toFixed(1)}s par question en moyenne
          </p>
        )}
        {wrong.length > 0 && (
          <div style={{ textAlign: "left", background: "var(--soft)", borderRadius: 18, padding: 14, marginBottom: 16 }}>
            <p className="tm-display" style={{ fontWeight: 800, margin: "0 0 8px" }}>À revoir :</p>
            {wrong.map((w, i) => (
              <div key={i} style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                {w.a} × {w.b} = <b style={{ color: "var(--mint-dk)" }}>{w.answer}</b>
                <span style={{ color: "var(--rasp)", marginLeft: 8, fontSize: 14 }}>
                  (tu as mis {w.given})
                </span>
              </div>
            ))}
          </div>
        )}
        <button className="tm-btn tm-btn-mint" style={{ width: "100%", marginBottom: 10 }} onClick={onReplay}>Rejouer</button>
        {wrongTables.length > 0 && (
          <button className="tm-btn tm-btn-rasp" style={{ width: "100%", marginBottom: 10 }}
            onClick={() => onReviewErrors(wrongTables)}>
            Réviser mes erreurs ({wrongTables.join(", ")})
          </button>
        )}
        <button className="tm-btn tm-btn-ghost" style={{ width: "100%", marginBottom: 10 }} onClick={onSetup}>Changer de tables</button>
        <button className="tm-back" style={{ marginTop: 4 }} onClick={onHome}>‹ Accueil</button>
      </div>
    </div>
  );
}

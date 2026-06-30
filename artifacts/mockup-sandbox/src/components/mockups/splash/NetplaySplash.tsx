const TMDB = "https://image.tmdb.org/t/p/w342";

const COLS = [
  ["/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg", "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", "/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg"],
  ["/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg", "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg", "/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg", "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg"],
  ["/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg", "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", "/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg"],
  ["/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg", "/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg", "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg", "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg"],
];

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { width: 100%; height: 100%; overflow: hidden; background: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }

.scene {
  position: relative;
  width: 390px; height: 844px;
  overflow: hidden;
  margin: auto;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse 60% 55% at 50% 46%, rgba(180,0,10,.16) 0%, transparent 70%),
              linear-gradient(180deg, #0a0002 0%, #050001 50%, #000 100%);
}

/* ── Poster columns ──────────────────────────────────────────── */
.poster-bg {
  position: absolute; inset: 0; z-index: 0;
  display: flex; gap: 5px; padding: 0 5px;
  overflow: hidden;
}
.poster-col { flex: 1; display: flex; flex-direction: column; gap: 5px; will-change: transform; }
.c0 { animation: drift 21s linear infinite; }
.c1 { animation: drift 27s linear infinite -12s; }
.c2 { animation: drift 18s linear infinite -6s; }
.c3 { animation: drift 24s linear infinite -17s; }
@keyframes drift { from { transform: translateY(0); } to { transform: translateY(-50%); } }
.poster-img { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 7px; opacity: .26; filter: saturate(.6); display: block; }

/* ── Overlays ────────────────────────────────────────────────── */
.ov-top {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background:
    linear-gradient(180deg, rgba(10,0,2,.6) 0%, rgba(5,0,1,.18) 28%, rgba(5,0,1,.18) 72%, rgba(5,0,1,.6) 100%);
}
.ov-radial {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: radial-gradient(ellipse 75% 65% at 50% 46%, transparent 22%, rgba(0,0,0,.72) 80%);
}

/* ── Scan lines ──────────────────────────────────────────────── */
.scanlines {
  position: absolute; inset: 0; z-index: 3; pointer-events: none; opacity: .06;
  background: repeating-linear-gradient(180deg, rgba(255,255,255,.025) 0px, rgba(255,255,255,.025) 1px, transparent 1px, transparent 7px);
  animation: scan 10s linear infinite;
}
@keyframes scan { from { background-position: 0 0; } to { background-position: 0 7px; } }

/* ── Orb + rings ─────────────────────────────────────────────── */
.orb {
  position: absolute; z-index: 3; pointer-events: none;
  width: 260px; height: 260px; border-radius: 50%;
  left: 50%; top: 46%; transform: translate(-50%,-50%);
  background: radial-gradient(circle, rgba(229,9,20,.26) 0%, rgba(229,9,20,.10) 46%, transparent 74%);
  filter: blur(14px);
  animation: orbPulse 4s ease-in-out infinite;
}
@keyframes orbPulse {
  0%,100% { transform: translate(-50%,-50%) scale(1); opacity: .8; }
  50%      { transform: translate(-50%,-50%) scale(1.13); opacity: 1; }
}
.ring {
  position: absolute; z-index: 3; pointer-events: none;
  border-radius: 50%; border: 1px solid rgba(229,9,20,.09);
  left: 50%; top: 46%; animation: ringPulse 5s ease-in-out infinite;
}
.r1 { width: 340px; height: 340px; margin: -170px 0 0 -170px; }
.r2 { width: 258px; height: 258px; margin: -129px 0 0 -129px; animation-delay: .3s; }
.r3 { width: 178px; height: 178px; margin: -89px  0 0 -89px;  animation-delay: .6s; }
@keyframes ringPulse {
  0%,100% { transform: scale(1); opacity: .9; }
  50%      { transform: scale(1.04); opacity: .5; }
}

/* ── Particles ───────────────────────────────────────────────── */
.particles { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.p { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: rgba(255,90,105,.9); box-shadow: 0 0 8px rgba(255,50,70,.5); opacity: 0; animation: pfloat 7s ease-in-out infinite; }
.p:nth-child(1){left:14%;top:26%;animation-delay:.3s}
.p:nth-child(2){left:24%;top:68%;animation-delay:1.1s}
.p:nth-child(3){left:43%;top:19%;animation-delay:.7s}
.p:nth-child(4){left:70%;top:23%;animation-delay:1.6s}
.p:nth-child(5){left:83%;top:65%;animation-delay:.9s}
.p:nth-child(6){left:57%;top:76%;animation-delay:1.9s}
@keyframes pfloat {
  0%,100% { opacity:0; transform: translateY(8px) scale(.7); }
  28%     { opacity:.85; }
  72%     { opacity:.3; }
  100%    { opacity:0; transform: translateY(-24px) scale(1.1); }
}

/* ── Main content ────────────────────────────────────────────── */
.content {
  position: relative; z-index: 5;
  display: flex; flex-direction: column; align-items: center; text-align: center;
  animation: contentCycle 6.8s cubic-bezier(.2,.9,.2,1) infinite;
}
@keyframes contentCycle {
  0%        { opacity:0; transform: scale(.968) translateY(18px); }
  11%,83%   { opacity:1; transform: scale(1) translateY(0); }
  100%      { opacity:0; transform: scale(1.02) translateY(-14px); }
}

/* ── Logo box ────────────────────────────────────────────────── */
.logo-outer {
  position: relative; width: 116px; height: 116px;
  margin-bottom: 26px;
  animation: logoEntrance 6.8s cubic-bezier(.2,.9,.2,1) infinite, logoFloat 3.8s ease-in-out infinite;
}
@keyframes logoEntrance {
  0%,8%    { opacity:0; transform: scale(.72) translateY(18px); }
  18%      { opacity:1; transform: scale(1.05) translateY(0); }
  26%,82%  { opacity:1; transform: scale(1) translateY(0); }
  100%     { opacity:0; transform: scale(1.06) translateY(-14px); }
}
@keyframes logoFloat {
  0%,100% { margin-top:0; }
  50%     { margin-top:-7px; }
}

.logo-halo {
  position: absolute;
  inset: -16px; border-radius: 50%;
  background: radial-gradient(circle, rgba(229,9,20,.3) 0%, rgba(229,9,20,.12) 50%, transparent 74%);
  filter: blur(12px);
  animation: haloPulse 3.8s ease-in-out infinite;
}
@keyframes haloPulse {
  0%,100% { transform: scale(1); opacity:.85; }
  50%     { transform: scale(1.1); opacity:1; }
}

.logo-box {
  position: relative;
  width: 116px; height: 116px; border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, #ff4e5a 0%, #f40309 44%, #900008 100%);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.13),
    0 16px 36px rgba(0,0,0,.44),
    0 0 52px rgba(229,9,20,.22),
    inset 0 2px 0 rgba(255,255,255,.26),
    inset 0 -2px 0 rgba(0,0,0,.22);
}
.logo-gloss {
  position: absolute; left:0; right:0; top:0; height:54%;
  background: linear-gradient(180deg, rgba(255,255,255,.22), transparent);
}
.logo-sweep {
  position: absolute; inset:0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.18) 50%, transparent 100%);
  transform: translateX(-160%) skewX(-18deg);
  filter: blur(.5px); mix-blend-mode: screen;
  animation: sweep 4s ease-in-out infinite;
}
@keyframes sweep {
  0%,55%  { transform: translateX(-160%) skewX(-18deg); opacity:0; }
  60%     { opacity:1; }
  74%,100%{ transform: translateX(160%)  skewX(-18deg); opacity:0; }
}

.n-wrap {
  position: absolute; inset:0;
  display: flex; align-items: center; justify-content: center;
  animation: nEntrance 6.8s cubic-bezier(.2,.9,.2,1) infinite;
}
@keyframes nEntrance {
  0%,12%   { opacity:0; transform: scale(.7); }
  22%      { opacity:1; transform: scale(1.06); }
  30%,82%  { opacity:1; transform: scale(1); }
  100%     { opacity:0; transform: scale(1.1); }
}
.n-letter {
  font-family: "Arial Black", "Arial Bold", Impact, Arial, sans-serif;
  font-size: 70px; font-weight: 900;
  color: #f8f8fa;
  text-shadow: 0 3px 10px rgba(0,0,0,.28);
  user-select: none; line-height: 1;
}

.play-badge {
  position: absolute; right:9px; bottom:9px;
  width:26px; height:26px; border-radius:50%;
  background: rgba(255,255,255,.95);
  display:flex; align-items:center; justify-content:center;
  box-shadow: 0 4px 10px rgba(0,0,0,.2);
  animation: badgePulse 2.4s ease-in-out infinite;
}
@keyframes badgePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
.play-badge::after {
  content:"";
  border-left: 9px solid #e50914;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  margin-left:2px;
}

/* ── Brand text ──────────────────────────────────────────────── */
.brand-glow {
  width:280px; height:50px;
  border-radius:50%;
  background: radial-gradient(ellipse, rgba(229,9,20,.32) 0%, transparent 70%);
  filter: blur(18px); opacity:0; pointer-events:none;
  animation: bglow 6.8s ease-in-out infinite;
}
@keyframes bglow { 0%,26%{opacity:0;transform:scale(.9)} 38%,80%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(1.08)} }

.brand {
  font-size: 58px; font-weight: 900;
  letter-spacing: .04em; line-height: 1;
  text-shadow: 0 6px 18px rgba(0,0,0,.32);
  margin-bottom: 13px;
  animation: brandIn 6.8s cubic-bezier(.2,.9,.2,1) infinite;
}
@keyframes brandIn {
  0%,20%   { opacity:0; transform:translateY(14px) scale(.97); }
  32%,82%  { opacity:1; transform:translateY(0) scale(1); }
  100%     { opacity:0; transform:translateY(-10px) scale(1.02); }
}
.net  { color: #e50914; }
.play { color: #f5f5f7; }

.subtitle {
  font-size: 10px; font-weight: 700;
  letter-spacing: .32em; text-transform: uppercase;
  color: rgba(208,188,192,.38);
  margin-bottom: 52px;
  animation: subIn 6.8s ease-in-out infinite;
}
@keyframes subIn { 0%,28%{opacity:0;transform:translateY(8px)} 40%,80%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-8px)} }

/* ── Progress bar ────────────────────────────────────────────── */
.loader { width:270px; animation: loadIn 6.8s ease-in-out infinite; }
@keyframes loadIn { 0%,36%{opacity:0;transform:translateY(10px)} 46%,84%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-6px)} }
.track {
  width:100%; height:6px; border-radius:999px;
  background:rgba(255,255,255,.08);
  overflow:hidden; margin-bottom:16px;
  box-shadow: inset 0 1px 0 rgba(0,0,0,.18);
}
.fill {
  height:100%; width:0%; border-radius:inherit;
  background: linear-gradient(90deg, #ff0e20, #ff3040, #ff8898, #ff1530);
  box-shadow: 0 0 14px rgba(255,30,48,.22);
  animation: fillAnim 6.8s ease-in-out infinite;
  position:relative;
}
.fill::after {
  content:""; position:absolute; top:0; bottom:0; right:-30px; width:70px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);
  transform:skewX(-18deg); filter:blur(.5px);
}
@keyframes fillAnim {
  0%,40% {width:0%} 50%{width:14%} 60%{width:38%} 70%{width:60%} 80%{width:84%} 90%{width:100%} 100%{width:100%}
}
.load-text { font-size:12px; font-weight:600; color:rgba(255,255,255,.22); letter-spacing:.02em; }

/* ── Blackout exit ───────────────────────────────────────────── */
.blackout { position:absolute; inset:0; background:#000; opacity:0; pointer-events:none; z-index:9; animation: bOut 6.8s ease-in-out infinite; }
@keyframes bOut { 0%,90%{opacity:0} 100%{opacity:1} }
`;

export default function NetplaySplash() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:"100%", height:"100vh", background:"#000" }}>
        <main className="scene">

          {/* Poster background */}
          <div className="poster-bg">
            {COLS.map((posters, ci) => (
              <div key={ci} className={`poster-col c${ci}`}>
                {[...posters, ...posters].map((src, i) => (
                  <img key={i} className="poster-img" src={`${TMDB}${src}`} alt="" />
                ))}
              </div>
            ))}
          </div>

          {/* Overlays */}
          <div className="ov-top" />
          <div className="ov-radial" />
          <div className="scanlines" />

          {/* Orb + rings */}
          <div className="orb" />
          <div className="ring r1" />
          <div className="ring r2" />
          <div className="ring r3" />

          {/* Particles */}
          <div className="particles">
            {[1,2,3,4,5,6].map(i => <span key={i} className="p" />)}
          </div>

          {/* Main content */}
          <section className="content">

            {/* Logo */}
            <div className="logo-outer">
              <div className="logo-halo" />
              <div className="logo-box">
                <div className="logo-gloss" />
                <div className="logo-sweep" />
                <div className="n-wrap">
                  <span className="n-letter">N</span>
                </div>
                <div className="play-badge" />
              </div>
            </div>

            {/* Brand glow */}
            <div className="brand-glow" />

            {/* NETPLAY brand */}
            <div className="brand">
              <span className="net">NET</span><span className="play">PLAY</span>
            </div>

            <div className="subtitle">CATÁLOGO PREMIUM · ENTRETENIMENTO</div>

            {/* Progress */}
            <div className="loader">
              <div className="track"><div className="fill" /></div>
              <div className="load-text">Carregando seu conteúdo personalizado...</div>
            </div>
          </section>

          <div className="blackout" />
        </main>
      </div>
    </>
  );
}

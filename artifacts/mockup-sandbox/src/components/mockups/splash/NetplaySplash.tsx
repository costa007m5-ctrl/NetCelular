const TMDB = "https://image.tmdb.org/t/p/w342";

const POSTERS_COL1 = [
  "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
  "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
  "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  "/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg",
  "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
];
const POSTERS_COL2 = [
  "/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg",
  "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
  "/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg",
  "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
  "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
];
const POSTERS_COL3 = [
  "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
  "/czembW0Rk1Ke7lCJGahbOhdNAqa.jpg",
  "/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg",
  "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
];
const POSTERS_COL4 = [
  "/7lTnXOy0iNtBAdRP3TZvaKJ77F6.jpg",
  "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
  "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
  "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
  "/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
];

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body, #root {
    width: 100%; height: 100%; overflow: hidden;
    background: #000;
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }

  .wrap {
    position: relative;
    width: 390px;
    height: 844px;
    overflow: hidden;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(circle at 50% 34%, rgba(255,27,42,.12), transparent 24%),
                linear-gradient(180deg, #090002 0%, #040001 56%, #000 100%);
    margin: auto;
  }

  /* ── Poster background ─────────────────────────────── */
  .poster-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    gap: 5px;
    padding: 0 5px;
    overflow: hidden;
  }

  .poster-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
    will-change: transform;
  }
  .poster-col.c1 { animation: drift 22s linear infinite; }
  .poster-col.c2 { animation: drift 28s linear infinite -11s; }
  .poster-col.c3 { animation: drift 19s linear infinite -6s; }
  .poster-col.c4 { animation: drift 25s linear infinite -16s; }

  @keyframes drift {
    from { transform: translateY(0); }
    to   { transform: translateY(-50%); }
  }

  .poster-img {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    border-radius: 7px;
    opacity: 0.28;
    filter: saturate(0.65);
    display: block;
  }

  /* ── Dark vignette over posters ─────────────────────── */
  .poster-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      radial-gradient(ellipse 80% 70% at 50% 50%, rgba(0,0,0,.05) 0%, rgba(0,0,0,.72) 75%),
      linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.18) 35%, rgba(0,0,0,.18) 65%, rgba(0,0,0,.55) 100%);
  }

  /* ── Scan lines ─────────────────────────────────────── */
  .scanlines {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    opacity: .08;
    background: repeating-linear-gradient(
      180deg,
      rgba(255,255,255,.022) 0px,
      rgba(255,255,255,.022) 1px,
      transparent 1px,
      transparent 7px
    );
    animation: scan 9s linear infinite;
  }
  @keyframes scan {
    from { transform: translateY(0); }
    to   { transform: translateY(7px); }
  }

  /* ── Orb + rings ────────────────────────────────────── */
  .bg {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    z-index: 3;
    pointer-events: none;
  }

  .orb {
    position: absolute;
    width: 260px; height: 260px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,25,40,.22), rgba(255,25,40,.09) 42%, transparent 72%);
    filter: blur(10px);
    animation: orbPulse 4s ease-in-out infinite;
  }
  @keyframes orbPulse {
    0%,100% { transform: scale(1); opacity: .7; }
    50%      { transform: scale(1.10); opacity: 1; }
  }

  .ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(255,24,42,.10);
    background: rgba(255,0,0,.015);
    animation: ringPulse 5s ease-in-out infinite;
  }
  .r1 { width: 340px; height: 340px; }
  .r2 { width: 260px; height: 260px; animation-delay: .25s; }
  .r3 { width: 180px; height: 180px; animation-delay: .5s; }
  @keyframes ringPulse {
    0%,100% { transform: scale(1); opacity: .8; }
    50%      { transform: scale(1.03); opacity: .45; }
  }

  /* ── Particles ──────────────────────────────────────── */
  .particles { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
  .particle {
    position: absolute;
    width: 3px; height: 3px;
    border-radius: 50%;
    background: rgba(255,105,115,.9);
    box-shadow: 0 0 8px rgba(255,70,85,.45);
    opacity: 0;
    animation: particleFloat 7s ease-in-out infinite;
  }
  .particle:nth-child(1) { left:15%; top:28%; animation-delay:.4s; }
  .particle:nth-child(2) { left:25%; top:66%; animation-delay:1.2s; }
  .particle:nth-child(3) { left:42%; top:20%; animation-delay:.8s; }
  .particle:nth-child(4) { left:68%; top:24%; animation-delay:1.5s; }
  .particle:nth-child(5) { left:82%; top:63%; animation-delay:1.0s; }
  .particle:nth-child(6) { left:58%; top:74%; animation-delay:1.8s; }
  @keyframes particleFloat {
    0%,100% { opacity: 0; transform: translateY(8px) scale(.7); }
    25%      { opacity: .8; }
    70%      { opacity: .35; }
    100%     { opacity: 0; transform: translateY(-22px) scale(1.08); }
  }

  /* ── Main content ───────────────────────────────────── */
  --cycle: 6.8s;
  .content {
    position: relative;
    z-index: 5;
    width: 320px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transform: translateY(-10px);
    animation: contentIn 6.8s cubic-bezier(.2,.9,.2,1) infinite;
  }
  @keyframes contentIn {
    0%             { opacity: 0; transform: translateY(18px) scale(.985); }
    10%, 84%       { opacity: 1; transform: translateY(-10px) scale(1); }
    100%           { opacity: 0; transform: translateY(-18px) scale(1.02); }
  }

  /* ── Logo ───────────────────────────────────────────── */
  .logo-wrap {
    position: relative;
    width: 120px; height: 120px;
    display: grid;
    place-items: center;
    margin-bottom: 24px;
    animation: logoOpenClose 6.8s cubic-bezier(.2,.9,.2,1) infinite;
  }
  @keyframes logoOpenClose {
    0%        { opacity: 0; transform: translateY(20px) scale(.78); }
    13%       { opacity: 1; transform: translateY(0) scale(1.05); }
    22%, 82%  { opacity: 1; transform: translateY(0) scale(1); }
    92%       { opacity: .9; transform: translateY(-7px) scale(1.06); }
    100%      { opacity: 0; transform: translateY(-18px) scale(1.12); }
  }

  .logo-glow {
    position: absolute;
    inset: -22%;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,45,60,.45) 0%, rgba(255,45,60,.18) 44%, transparent 74%);
    filter: blur(18px);
    animation: glowPulse 2.8s ease-in-out infinite;
  }
  @keyframes glowPulse {
    0%,100% { transform: scale(1); opacity: .8; }
    50%     { transform: scale(1.09); opacity: 1; }
  }

  .logo-box {
    position: relative;
    width: 100%; height: 100%;
    border-radius: 26px;
    overflow: hidden;
    background: linear-gradient(180deg, #ff4954 0%, #f40309 45%, #970008 100%);
    box-shadow:
      0 20px 40px rgba(0,0,0,.4),
      0 0 48px rgba(255,25,35,.18),
      inset 0 2px 0 rgba(255,255,255,.26),
      inset 0 -2px 0 rgba(0,0,0,.24);
    animation: logoFloat 3.8s ease-in-out infinite;
  }
  @keyframes logoFloat {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(-6px); }
  }

  .logo-shine-top {
    position: absolute;
    left: 0; right: 0; top: 0;
    height: 50%;
    background: linear-gradient(180deg, rgba(255,255,255,.18), transparent);
  }

  .logo-sweep {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent);
    transform: translateX(-145%) skewX(-18deg);
    animation: logoSweep 4.2s ease-in-out infinite;
  }
  @keyframes logoSweep {
    0%,58% { transform: translateX(-145%) skewX(-18deg); }
    73%,100% { transform: translateX(145%) skewX(-18deg); }
  }

  /* ── N letter split animation ───────────────────────── */
  .n-stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }

  .n-aura {
    position: absolute;
    font-family: "Arial Black", Impact, Arial, sans-serif;
    font-size: 72px;
    font-weight: 900;
    color: #f7f7f8;
    opacity: 0;
    filter: blur(8px);
    transform: scale(1.08);
    animation: nAura 6.8s ease-in-out infinite;
    user-select: none;
  }
  @keyframes nAura {
    0%,10% { opacity: 0; transform: scale(.86); }
    22%,78% { opacity: .18; transform: scale(1.08); }
    100%    { opacity: 0; transform: scale(1.18); }
  }

  .n-half {
    position: absolute;
    font-family: "Arial Black", Impact, Arial, sans-serif;
    font-size: 72px;
    font-weight: 900;
    color: #f7f7f8;
    text-shadow: 0 2px 8px rgba(0,0,0,.12);
    opacity: 0;
    user-select: none;
    overflow: hidden;
  }
  .n-left  {
    clip-path: inset(0 50% 0 0);
    animation: nLeft 6.8s cubic-bezier(.2,.9,.2,1) infinite;
  }
  .n-right {
    clip-path: inset(0 0 0 50%);
    animation: nRight 6.8s cubic-bezier(.2,.9,.2,1) infinite;
  }
  @keyframes nLeft {
    0%,8%   { opacity: 0; transform: translate(-18px, 8px) scale(.84); }
    18%     { opacity: 1; transform: translate(4px, 0) scale(1.03); }
    25%,82% { opacity: 1; transform: translate(0,0) scale(1); }
    100%    { opacity: 0; transform: translate(-12px,-6px) scale(1.04); }
  }
  @keyframes nRight {
    0%,10%  { opacity: 0; transform: translate(18px,-8px) scale(.84); }
    20%     { opacity: 1; transform: translate(-4px,0) scale(1.03); }
    27%,82% { opacity: 1; transform: translate(0,0) scale(1); }
    100%    { opacity: 0; transform: translate(12px,-6px) scale(1.04); }
  }

  .n-shine {
    position: absolute;
    inset: -10% 20%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.58), transparent);
    transform: translateX(-180%) skewX(-18deg);
    filter: blur(1px);
    mix-blend-mode: screen;
    animation: nShine 6.8s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes nShine {
    0%,24%  { opacity:0; transform:translateX(-180%) skewX(-18deg); }
    32%     { opacity:.95; }
    44%,100%{ opacity:0;  transform:translateX(180%) skewX(-18deg); }
  }

  .play-badge {
    position: absolute;
    right: 10%; bottom: 10%;
    width: 30%; aspect-ratio: 1;
    border-radius: 50%;
    background: #f5f5f7;
    display: grid;
    place-items: center;
    box-shadow: 0 6px 14px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.65);
    animation: playPulse 2.3s ease-in-out infinite;
  }
  .play-badge::before {
    content: "";
    width: 0; height: 0;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-left: 13px solid #df1e2d;
    margin-left: 3px;
  }
  @keyframes playPulse {
    0%,100% { transform: scale(1); }
    50%     { transform: scale(1.06); }
  }

  /* ── Brand name ─────────────────────────────────────── */
  .brand {
    display: flex;
    align-items: center;
    gap: .03em;
    font-weight: 900;
    font-size: 58px;
    letter-spacing: .07em;
    line-height: 1;
    text-shadow: 0 8px 20px rgba(0,0,0,.35);
    margin-bottom: 14px;
  }

  .letter {
    display: inline-block;
    opacity: 0;
    transform: translateY(16px) scale(.96);
    animation: letterIn 6.8s cubic-bezier(.2,.9,.2,1) infinite;
  }
  .net  { color: #ff1f33; }
  .play { color: #f6f6f8; }

  .letter:nth-child(1) { animation-delay:.82s; }
  .letter:nth-child(2) { animation-delay:.92s; }
  .letter:nth-child(3) { animation-delay:1.02s; }
  .letter:nth-child(4) { animation-delay:1.15s; }
  .letter:nth-child(5) { animation-delay:1.25s; }
  .letter:nth-child(6) { animation-delay:1.35s; }
  .letter:nth-child(7) { animation-delay:1.45s; }
  @keyframes letterIn {
    0%,12%  { opacity:0; transform:translateY(16px) scale(.96); }
    20%     { opacity:1; transform:translateY(-3px) scale(1.03); }
    28%,82% { opacity:1; transform:translateY(0) scale(1); }
    100%    { opacity:0; transform:translateY(-12px) scale(1.04); }
  }

  .brand-glow {
    position: absolute;
    margin-top: 6px;
    width: 280px; height: 60px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,34,50,.34), transparent 70%);
    filter: blur(20px);
    opacity: 0;
    pointer-events: none;
    animation: brandGlow 6.8s ease-in-out infinite;
  }
  @keyframes brandGlow {
    0%,24%  { opacity:0; transform:scale(.9); }
    36%,80% { opacity:1; transform:scale(1); }
    100%    { opacity:0; transform:scale(1.08); }
  }

  /* ── Subtitle ───────────────────────────────────────── */
  .subtitle {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .3em;
    text-transform: uppercase;
    color: rgba(214,194,198,.44);
    opacity: 0;
    margin-bottom: 44px;
    white-space: nowrap;
    animation: subtitleIn 6.8s ease-in-out infinite;
  }
  @keyframes subtitleIn {
    0%,22%  { opacity:0; transform:translateY(10px); }
    34%,80% { opacity:1; transform:translateY(0); }
    100%    { opacity:0; transform:translateY(-10px); }
  }

  /* ── Progress bar ───────────────────────────────────── */
  .loader {
    width: 280px;
    opacity: 0;
    animation: loaderIn 6.8s ease-in-out infinite;
  }
  @keyframes loaderIn {
    0%,30%  { opacity:0; transform:translateY(12px); }
    40%,84% { opacity:1; transform:translateY(0); }
    100%    { opacity:0; transform:translateY(-8px); }
  }

  .track {
    width: 100%; height: 7px;
    border-radius: 999px;
    background: rgba(255,255,255,.08);
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.04), inset 0 -1px 0 rgba(0,0,0,.25);
    margin-bottom: 18px;
  }
  .fill {
    height: 100%;
    width: 0%;
    border-radius: inherit;
    background: linear-gradient(90deg, #ff1125 0%, #ff3345 44%, #ff7881 76%, #ff2335 100%);
    box-shadow: 0 0 14px rgba(255,40,52,.24);
    animation: fillBar 6.8s ease-in-out infinite;
    position: relative;
  }
  .fill::after {
    content:"";
    position:absolute;
    top:0;bottom:0;right:-32px;width:80px;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.36),transparent);
    transform:skewX(-18deg);
    filter:blur(.5px);
  }
  @keyframes fillBar {
    0%,36% { width:0%; }
    46%    { width:12%; }
    58%    { width:36%; }
    70%    { width:62%; }
    82%    { width:88%; }
    90%    { width:100%; }
    100%   { width:100%; }
  }

  .load-text {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,.28);
    line-height: 1.4;
    animation: textFade 2s ease-in-out infinite;
  }
  @keyframes textFade {
    0%,100% { opacity:.55; }
    50%     { opacity:1; }
  }

  .dots::after {
    content:"";
    animation: dots 1.4s steps(4,end) infinite;
  }
  @keyframes dots {
    0%  { content:""; }
    25% { content:"."; }
    50% { content:".."; }
    75% { content:"..."; }
  }

  /* ── Blackout exit ──────────────────────────────────── */
  .blackout {
    position: absolute;
    inset: 0;
    background: #000;
    opacity: 0;
    pointer-events: none;
    z-index: 9;
    animation: blackout 6.8s ease-in-out infinite;
  }
  @keyframes blackout {
    0%,90% { opacity:0; }
    100%   { opacity:1; }
  }
`;

export default function NetplaySplash() {
  const cols = [
    { id: "c1", posters: POSTERS_COL1 },
    { id: "c2", posters: POSTERS_COL2 },
    { id: "c3", posters: POSTERS_COL3 },
    { id: "c4", posters: POSTERS_COL4 },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100vh", background: "#000" }}>
        <main className="wrap">

          {/* ── Poster background ── */}
          <div className="poster-bg">
            {cols.map(({ id, posters }) => (
              <div key={id} className={`poster-col ${id}`}>
                {[...posters, ...posters].map((src, i) => (
                  <img
                    key={i}
                    className="poster-img"
                    src={`${TMDB}${src}`}
                    alt=""
                    loading="eager"
                  />
                ))}
              </div>
            ))}
          </div>

          {/* ── Vignette overlay ── */}
          <div className="poster-overlay" />

          {/* ── Scan lines ── */}
          <div className="scanlines" />

          {/* ── Orb + rings ── */}
          <div className="bg">
            <div className="orb" />
            <div className="ring r1" />
            <div className="ring r2" />
            <div className="ring r3" />
          </div>

          {/* ── Floating particles ── */}
          <div className="particles">
            {[1,2,3,4,5,6].map(i => <span key={i} className="particle" />)}
          </div>

          {/* ── Main content ── */}
          <section className="content">

            {/* Logo */}
            <div className="logo-wrap">
              <div className="logo-glow" />
              <div className="logo-box">
                <div className="logo-shine-top" />
                <div className="logo-sweep" />

                {/* N split animation */}
                <div className="n-stage">
                  <span className="n-aura">N</span>
                  <span className="n-half n-left">N</span>
                  <span className="n-half n-right">N</span>
                  <div className="n-shine" />
                </div>

                {/* Play badge */}
                <div className="play-badge" />
              </div>
            </div>

            {/* Brand glow */}
            <div className="brand-glow" />

            {/* Brand name */}
            <div className="brand">
              <span className="letter net">N</span>
              <span className="letter net">E</span>
              <span className="letter net">T</span>
              <span className="letter play">P</span>
              <span className="letter play">L</span>
              <span className="letter play">A</span>
              <span className="letter play">Y</span>
            </div>

            <div className="subtitle">CATÁLOGO PREMIUM · ENTRETENIMENTO</div>

            {/* Progress */}
            <div className="loader">
              <div className="track">
                <div className="fill" />
              </div>
              <div className="load-text">
                Carregando seu conteúdo personalizado<span className="dots" />
              </div>
            </div>
          </section>

          {/* ── Blackout ── */}
          <div className="blackout" />
        </main>
      </div>
    </>
  );
}

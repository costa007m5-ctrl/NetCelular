import { useEffect, useRef } from "react";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

  :root {
    --bg:#000000;
    --bg-soft:#090103;
    --red:#ff2034;
    --red-soft:#ff6672;
    --red-deep:#94000b;
    --white:#f6f7f8;
    --muted:rgba(255,255,255,.32);
  }

  *{box-sizing:border-box;margin:0;padding:0}

  .nl-root {
    width:100%;
    height:100%;
    overflow:hidden;
    background:#000;
    font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
    color:#fff;
    display:grid;
    place-items:center;
    background:
      radial-gradient(circle at 50% 42%, rgba(255,36,52,.14), transparent 26%),
      linear-gradient(180deg, #090103 0%, #030001 55%, #000 100%);
  }

  .nl-screen{
    position:relative;
    width:390px;
    height:844px;
    overflow:hidden;
    display:grid;
    place-items:center;
    isolation:isolate;
  }

  .nl-screen::before{
    content:"";
    position:absolute;
    inset:0;
    z-index:0;
    pointer-events:none;
    background:
      radial-gradient(circle at center, transparent 0 40%, rgba(0,0,0,.24) 76%, rgba(0,0,0,.70) 100%),
      linear-gradient(180deg, rgba(255,255,255,.03), transparent 16%, transparent 84%, rgba(0,0,0,.24));
  }

  .nl-screen::after{
    content:"";
    position:absolute;
    inset:0;
    z-index:0;
    pointer-events:none;
    opacity:.08;
    background:repeating-linear-gradient(
      180deg,
      rgba(255,255,255,.017) 0px,
      rgba(255,255,255,.017) 1px,
      transparent 1px,
      transparent 8px
    );
    animation:nl-scan 10s linear infinite;
  }

  .nl-ambient{
    position:absolute;
    inset:0;
    z-index:1;
    display:grid;
    place-items:center;
    pointer-events:none;
  }

  .nl-ambient-glow{
    position:absolute;
    width:420px;
    height:420px;
    border-radius:50%;
    background:radial-gradient(circle, rgba(255,30,45,.20), rgba(255,30,45,.08) 42%, rgba(255,30,45,0) 72%);
    filter:blur(14px);
    animation:nl-bgPulse 3.2s ease-in-out infinite;
  }

  .nl-ring{
    position:absolute;
    border-radius:50%;
    border:1px solid rgba(255,36,52,.11);
    background:rgba(255,0,0,.015);
    animation:nl-ringPulse 4.8s ease-in-out infinite;
  }

  .nl-ring.r1{width:340px;height:340px}
  .nl-ring.r2{width:260px;height:260px;animation-delay:.24s}
  .nl-ring.r3{width:180px;height:180px;animation-delay:.48s}

  .nl-light-sweep{
    position:absolute;
    inset:-8% -35%;
    background:linear-gradient(90deg, transparent 38%, rgba(255,255,255,.05) 50%, transparent 62%);
    filter:blur(14px);
    transform:translateX(-60%) rotate(-10deg);
    opacity:0;
    animation:nl-sweep 4.8s ease-in-out infinite;
  }

  .nl-particles{
    position:absolute;
    inset:0;
    z-index:1;
    pointer-events:none;
  }

  .nl-p{
    position:absolute;
    width:4px;
    height:4px;
    border-radius:50%;
    background:rgba(255,110,120,.88);
    box-shadow:0 0 10px rgba(255,70,90,.36);
    opacity:0;
    animation:nl-particle 6.8s ease-in-out infinite;
  }

  .nl-p:nth-child(1){left:19%;top:34%;animation-delay:.2s}
  .nl-p:nth-child(2){left:30%;top:67%;animation-delay:.9s}
  .nl-p:nth-child(3){left:42%;top:25%;animation-delay:.5s}
  .nl-p:nth-child(4){left:63%;top:24%;animation-delay:1.1s}
  .nl-p:nth-child(5){left:77%;top:66%;animation-delay:.75s}
  .nl-p:nth-child(6){left:58%;top:73%;animation-delay:1.35s}

  .nl-loader-wrap{
    position:relative;
    z-index:3;
    width:290px;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:18px;
    transform:translateY(-1vh);
    animation:nl-intro .9s cubic-bezier(.2,.9,.2,1) both;
  }

  .nl-loader{
    position:relative;
    width:128px;
    height:128px;
    display:grid;
    place-items:center;
  }

  .nl-halo{
    position:absolute;
    inset:-18px;
    border-radius:50%;
    background:radial-gradient(circle, rgba(255,45,60,.23), rgba(255,45,60,.08) 40%, rgba(255,45,60,0) 72%);
    filter:blur(12px);
    animation:nl-halo 2.2s ease-in-out infinite;
  }

  .nl-track{
    position:absolute;
    inset:8px;
    border-radius:50%;
    border:1px solid rgba(255,255,255,.08);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
  }

  .nl-arc{
    position:absolute;
    border-radius:50%;
    border:4px solid transparent;
    filter:drop-shadow(0 0 12px rgba(255,40,55,.24));
  }

  .nl-arc.a1{
    inset:0;
    border-top-color:#ff2034;
    border-right-color:#ff6672;
    animation:nl-spin 1.05s linear infinite;
  }

  .nl-arc.a2{
    inset:12px;
    border-width:3px;
    border-bottom-color:rgba(255,105,116,.88);
    border-left-color:rgba(255,31,51,.78);
    animation:nl-spinReverse 1.75s linear infinite;
  }

  .nl-arc.a3{
    inset:22px;
    border-width:2px;
    border-top-color:rgba(255,255,255,.16);
    border-right-color:rgba(255,255,255,.05);
    animation:nl-spin 2.4s linear infinite;
    opacity:.7;
  }

  .nl-orbit{
    position:absolute;
    inset:0;
    animation:nl-spin 5s linear infinite;
  }

  .nl-orbit span{
    position:absolute;
    top:4px;
    left:50%;
    width:7px;
    height:7px;
    margin-left:-3.5px;
    border-radius:50%;
    background:linear-gradient(180deg, #ff6672, #ff2034);
    box-shadow:0 0 12px rgba(255,45,60,.30);
  }

  .nl-center{
    position:relative;
    width:68px;
    height:68px;
    border-radius:22px;
    overflow:hidden;
    display:grid;
    place-items:center;
    background:linear-gradient(180deg, #ff4c58 0%, #f40408 46%, #980008 100%);
    box-shadow:
      0 10px 24px rgba(0,0,0,.34),
      0 0 26px rgba(255,35,50,.15),
      inset 0 1px 0 rgba(255,255,255,.24),
      inset 0 -1px 0 rgba(0,0,0,.20);
    animation:nl-centerPulse 2s ease-in-out infinite;
  }

  .nl-center::before{
    content:"";
    position:absolute;
    left:0;right:0;top:0;
    height:50%;
    background:linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0));
  }

  .nl-center::after{
    content:"";
    position:absolute;
    inset:0;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
    transform:translateX(-150%) skewX(-18deg);
    animation:nl-shine 2.5s ease-in-out infinite;
  }

  .nl-n{
    position:relative;
    z-index:1;
    font-family:"Arial Black", Impact, Inter, Arial, sans-serif;
    font-size:40px;
    line-height:1;
    font-weight:900;
    letter-spacing:-.05em;
    color:#f6f7f8;
    transform:translateY(-1px);
    text-shadow:0 2px 8px rgba(0,0,0,.12);
    animation:nl-nPulse 1.9s ease-in-out infinite;
  }

  .nl-play{
    position:absolute;
    right:-2px;
    bottom:-2px;
    width:26px;
    height:26px;
    border-radius:50%;
    background:#f5f5f7;
    display:grid;
    place-items:center;
    z-index:2;
    box-shadow:0 4px 10px rgba(0,0,0,.24);
    animation:nl-playPulse 1.9s ease-in-out infinite;
  }

  .nl-play::before{
    content:"";
    width:0;height:0;
    border-top:6px solid transparent;
    border-bottom:6px solid transparent;
    border-left:10px solid #df1e2d;
    margin-left:2px;
  }

  .nl-equalizer{
    display:flex;
    align-items:flex-end;
    justify-content:center;
    gap:7px;
    height:18px;
  }

  .nl-equalizer span{
    width:7px;
    border-radius:999px;
    background:linear-gradient(180deg, #ff6672, #ff2034);
    box-shadow:0 0 10px rgba(255,50,65,.18);
    animation:nl-bars 1s ease-in-out infinite;
  }

  .nl-equalizer span:nth-child(1){height:8px;animation-delay:0s}
  .nl-equalizer span:nth-child(2){height:16px;animation-delay:.12s}
  .nl-equalizer span:nth-child(3){height:11px;animation-delay:.24s}
  .nl-equalizer span:nth-child(4){height:16px;animation-delay:.36s}
  .nl-equalizer span:nth-child(5){height:8px;animation-delay:.48s}

  .nl-text{
    text-align:center;
    color:rgba(255,255,255,.32);
    font-size:19px;
    font-weight:600;
    line-height:1.35;
    animation:nl-textPulse 1.9s ease-in-out infinite;
  }

  .nl-text strong{
    color:rgba(255,255,255,.84);
    font-weight:700;
  }

  .nl-sub{
    margin-top:-6px;
    text-align:center;
    color:rgba(255,255,255,.14);
    font-size:11px;
    font-weight:700;
    letter-spacing:.22em;
    text-transform:uppercase;
  }

  .nl-dots::after{
    content:"";
    animation:nl-dots 1.3s steps(4,end) infinite;
  }

  @keyframes nl-intro{
    from{opacity:0;transform:translateY(14px) scale(.95)}
    to{opacity:1;transform:translateY(-1vh) scale(1)}
  }
  @keyframes nl-scan{
    from{transform:translateY(0)}
    to{transform:translateY(8px)}
  }
  @keyframes nl-bgPulse{
    0%,100%{transform:scale(1);opacity:.75}
    50%{transform:scale(1.08);opacity:1}
  }
  @keyframes nl-ringPulse{
    0%,100%{transform:scale(1);opacity:.8}
    50%{transform:scale(1.03);opacity:.55}
  }
  @keyframes nl-sweep{
    0%,16%{opacity:0;transform:translateX(-60%) rotate(-10deg)}
    26%{opacity:.95}
    42%,100%{opacity:0;transform:translateX(60%) rotate(-10deg)}
  }
  @keyframes nl-particle{
    0%,100%{opacity:0;transform:translateY(8px) scale(.72)}
    25%{opacity:.75}
    70%{opacity:.36}
    100%{opacity:0;transform:translateY(-20px) scale(1.06)}
  }
  @keyframes nl-halo{
    0%,100%{transform:scale(1);opacity:.72}
    50%{transform:scale(1.10);opacity:1}
  }
  @keyframes nl-spin{
    from{transform:rotate(0deg)}
    to{transform:rotate(360deg)}
  }
  @keyframes nl-spinReverse{
    from{transform:rotate(360deg)}
    to{transform:rotate(0deg)}
  }
  @keyframes nl-centerPulse{
    0%,100%{transform:scale(1)}
    50%{transform:scale(1.06)}
  }
  @keyframes nl-shine{
    0%,56%{transform:translateX(-150%) skewX(-18deg)}
    72%,100%{transform:translateX(150%) skewX(-18deg)}
  }
  @keyframes nl-nPulse{
    0%,100%{transform:translateY(-1px) scale(1)}
    50%{transform:translateY(-1px) scale(1.05)}
  }
  @keyframes nl-playPulse{
    0%,100%{transform:scale(1)}
    50%{transform:scale(1.08)}
  }
  @keyframes nl-bars{
    0%,100%{transform:scaleY(.72);opacity:.55}
    50%{transform:scaleY(1.26);opacity:1}
  }
  @keyframes nl-textPulse{
    0%,100%{opacity:.58}
    50%{opacity:1}
  }
  @keyframes nl-dots{
    0%{content:""}
    25%{content:"."}
    50%{content:".."}
    75%{content:"..."}
    100%{content:""}
  }
`;

export default function NetplayLoaderV29() {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    styleRef.current = style;
    return () => {
      styleRef.current?.remove();
    };
  }, []);

  return (
    <div className="nl-root" style={{ width: "100vw", height: "100vh" }}>
      <div className="nl-screen">
        <div className="nl-ambient" aria-hidden="true">
          <div className="nl-ambient-glow" />
          <div className="nl-ring r1" />
          <div className="nl-ring r2" />
          <div className="nl-ring r3" />
          <div className="nl-light-sweep" />
        </div>

        <div className="nl-particles" aria-hidden="true">
          <span className="nl-p" />
          <span className="nl-p" />
          <span className="nl-p" />
          <span className="nl-p" />
          <span className="nl-p" />
          <span className="nl-p" />
        </div>

        <section className="nl-loader-wrap" aria-label="Carregando">
          <div className="nl-loader">
            <div className="nl-halo" />
            <div className="nl-track" />
            <div className="nl-arc a1" />
            <div className="nl-arc a2" />
            <div className="nl-arc a3" />
            <div className="nl-orbit"><span /></div>

            <div className="nl-center">
              <div className="nl-n">N</div>
              <div className="nl-play" />
            </div>
          </div>

          <div className="nl-equalizer" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>

          <div className="nl-text">
            <strong>Carregando</strong><span className="nl-dots" />
          </div>

          <div className="nl-sub">netplay streaming</div>
        </section>
      </div>
    </div>
  );
}

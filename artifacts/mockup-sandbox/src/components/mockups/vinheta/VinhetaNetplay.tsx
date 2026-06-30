import { useEffect, useRef } from "react";
import "./vinheta.css";

const DEFAULT_LOGO = "https://image.tmdb.org/t/p/w342/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg";
const DEFAULT_TITLE = "Vingadores: Ultimato";

function playOpeningSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.3);
    master.gain.setValueAtTime(0.7, ctx.currentTime + 5.5);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 9);
    master.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    const reverbBuffer = ctx.createBuffer(2, ctx.sampleRate * 2.5, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = reverbBuffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
      }
    }
    reverb.buffer = reverbBuffer;
    reverb.connect(master);

    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    dry.connect(master);

    function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.07);
      g.gain.setValueAtTime(vol, ctx.currentTime + start + dur - 0.12);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.connect(g);
      g.connect(reverb);
      g.connect(dry);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.02);
    }

    function boom(start: number, vol = 0.9) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.18));
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 1.1);
      src.connect(g);
      g.connect(reverb);
      g.connect(dry);
      src.start(ctx.currentTime + start);
    }

    function riser(start: number) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(60, ctx.currentTime + start);
      osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + start + 2.8);
      g.gain.setValueAtTime(0, ctx.currentTime + start);
      g.gain.linearRampToValueAtTime(0.22, ctx.currentTime + start + 0.5);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + 2.8);
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(200, ctx.currentTime + start);
      filt.frequency.exponentialRampToValueAtTime(4000, ctx.currentTime + start + 2.8);
      osc.connect(filt);
      filt.connect(g);
      g.connect(reverb);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 3);
    }

    boom(0.0, 0.85);
    riser(0.2);
    tone(110, 0.8, 1.2, 0.28, "triangle");
    tone(220, 1.4, 0.9, 0.22, "sine");
    boom(2.2, 0.65);
    tone(330, 2.5, 0.7, 0.20, "sine");
    tone(440, 3.0, 0.6, 0.18, "sine");
    tone(550, 3.5, 0.5, 0.16, "sine");
    tone(660, 4.0, 0.4, 0.14, "sine");
    boom(4.8, 0.75);
    tone(880, 5.0, 1.6, 0.30, "sine");
    tone(1100, 5.5, 1.2, 0.18, "sine");
    tone(440, 6.5, 2.0, 0.22, "triangle");
    boom(7.5, 0.55);
  } catch {}
}

export function VinhetaNetplay() {
  const played = useRef(false);

  useEffect(() => {
    if (played.current) return;
    played.current = true;
    const t = setTimeout(() => playOpeningSound(), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="vinheta-root">
      <main className="stage">
        <div className="curtains" aria-hidden="true" />
        <div className="aurora" aria-hidden="true" />

        <div className="particles" aria-hidden="true">
          <span className="particle" />
          <span className="particle red" />
          <span className="particle" />
          <span className="particle red" />
          <span className="particle" />
          <span className="particle red" />
          <span className="particle" />
          <span className="particle red" />
          <span className="particle" />
          <span className="particle red" />
        </div>

        <svg className="scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" aria-label="Vinheta Netplay">
          <defs>
            <linearGradient id="orbitGradient" x1="260" y1="460" x2="1660" y2="460" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#2d95ff" stopOpacity="0"/>
              <stop offset=".24" stopColor="#94e4ff"/>
              <stop offset=".66" stopColor="#3aa7ff"/>
              <stop offset="1" stopColor="#efffff"/>
            </linearGradient>
            <linearGradient id="horizonGradient" x1="390" y1="602" x2="1530" y2="602" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff1830" stopOpacity="0"/>
              <stop offset=".18" stopColor="#ff1830"/>
              <stop offset=".50" stopColor="#ffffff"/>
              <stop offset=".82" stopColor="#ff1830"/>
              <stop offset="1" stopColor="#ff1830" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="badgeFill" x1="778" y1="314" x2="1142" y2="690" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="rgba(255,255,255,.20)"/>
              <stop offset=".35" stopColor="rgba(255,255,255,.055)"/>
              <stop offset="1" stopColor="rgba(255,24,48,.16)"/>
            </linearGradient>
            <linearGradient id="badgeStroke" x1="778" y1="314" x2="1142" y2="690" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="rgba(255,255,255,.45)"/>
              <stop offset=".45" stopColor="rgba(255,35,55,.42)"/>
              <stop offset="1" stopColor="rgba(70,183,255,.30)"/>
            </linearGradient>
            <linearGradient id="nFill" x1="760" y1="300" x2="1160" y2="690" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff7a82"/>
              <stop offset=".22" stopColor="#ff2638"/>
              <stop offset=".57" stopColor="#d30015"/>
              <stop offset="1" stopColor="#ff4355"/>
            </linearGradient>
            <linearGradient id="nStroke" x1="730" y1="320" x2="1210" y2="680" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ffd0d4" stopOpacity=".90"/>
              <stop offset=".42" stopColor="#ff4b58" stopOpacity=".36"/>
              <stop offset="1" stopColor="#69000b" stopOpacity=".50"/>
            </linearGradient>
            <linearGradient id="titleRed" x1="535" y1="715" x2="895" y2="790" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ff5966"/>
              <stop offset=".48" stopColor="#ff1b30"/>
              <stop offset="1" stopColor="#98000f"/>
            </linearGradient>
            <linearGradient id="titleSilver" x1="955" y1="715" x2="1415" y2="790" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#ffffff"/>
              <stop offset=".48" stopColor="#e3e6ee"/>
              <stop offset="1" stopColor="#7e858f"/>
            </linearGradient>
            <radialGradient id="mainGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#ff2336" stopOpacity=".46"/>
              <stop offset=".46" stopColor="#ff2336" stopOpacity=".10"/>
              <stop offset="1" stopColor="#ff2336" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="brandGlowFill" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#ff3141" stopOpacity=".68"/>
              <stop offset=".45" stopColor="#ff3141" stopOpacity=".15"/>
              <stop offset="1" stopColor="#ff3141" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="metal" x1="800" y1="314" x2="1120" y2="685" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="rgba(255,255,255,.36)"/>
              <stop offset=".50" stopColor="rgba(255,255,255,.04)"/>
              <stop offset="1" stopColor="rgba(0,0,0,.42)"/>
            </linearGradient>
            <mask id="nFillMask">
              <rect x="0" y="0" width="1920" height="1080" fill="black"/>
              <rect className="fill-mask-rect" x="700" y="260" width="520" height="540" fill="white"/>
            </mask>
            <clipPath id="nClip">
              <text x="960" y="592" textAnchor="middle"
                    fontFamily="Arial Black, Impact, Inter, Arial, sans-serif"
                    fontSize="370" fontWeight="900">N</text>
            </clipPath>
            <clipPath id="titleClip">
              <text x="960" y="770" textAnchor="middle"
                    fontFamily="Inter, Arial, sans-serif"
                    fontSize="104" fontWeight="900" letterSpacing="8">NETPLAY</text>
            </clipPath>
            <filter id="premiumGlow" x="-45%" y="-45%" width="190%" height="190%">
              <feGaussianBlur stdDeviation="7" result="blur"/>
              <feColorMatrix in="blur" type="matrix"
                values="1 0 0 0 0.95 0 0.18 0 0 0 0 0 0.22 0 0.05 0 0 0 .70 0"/>
              <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glassSoft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.1"/>
            </filter>
          </defs>

          <circle cx="960" cy="520" r="340" fill="url(#mainGlow)" opacity=".78"/>

          <path className="orbit-glow" d="M300 496 C550 292, 1060 238, 1620 482"
                fill="none" stroke="#2d95ff" strokeWidth="18" strokeLinecap="round"/>
          <path className="orbit-main" d="M300 496 C550 292, 1060 238, 1620 482"
                fill="none" stroke="url(#orbitGradient)" strokeWidth="7" strokeLinecap="round"/>

          <g className="star">
            <g className="star-core">
              <path d="M1572 432 L1584 458 L1572 484 L1560 458 Z" fill="#ffffff"/>
              <path d="M1546 458 C1560 454, 1566 447, 1572 432 C1578 447, 1584 454, 1598 458 C1584 462, 1578 469, 1572 484 C1566 469, 1560 462, 1546 458 Z"
                    fill="rgba(142,225,255,.55)"/>
              <circle cx="1572" cy="458" r="4.8" fill="#f4ffff"/>
            </g>
          </g>

          <path className="horizon" d="M390 602 L1530 602"
                fill="none" stroke="url(#horizonGradient)" strokeWidth="5" strokeLinecap="round"/>
          <rect className="scanner" x="925" y="596" width="86" height="10" rx="5" fill="rgba(255,255,255,.42)"/>

          <g className="floor">
            <ellipse cx="960" cy="858" rx="415" ry="64" fill="rgba(255, 20, 40, .25)"/>
            <path d="M580 815 L1340 815" stroke="rgba(255,255,255,.14)" strokeWidth="2"/>
            <path d="M700 860 L1220 860" stroke="rgba(255,255,255,.085)" strokeWidth="2"/>
          </g>

          <g>
            <rect className="fragment f1" style={{"--x":"-115px","--y":"-45px","--r":"-22deg"} as any}
                  x="930" y="482" width="21" height="72" rx="10" fill="#ff4352"/>
            <rect className="fragment f2" style={{"--x":"112px","--y":"-40px","--r":"20deg"} as any}
                  x="966" y="488" width="21" height="72" rx="10" fill="#ff182c"/>
            <rect className="fragment f3" style={{"--x":"-88px","--y":"76px","--r":"24deg"} as any}
                  x="950" y="526" width="82" height="16" rx="8" fill="#ff7b82"/>
            <rect className="fragment f4" style={{"--x":"92px","--y":"72px","--r":"-24deg"} as any}
                  x="905" y="520" width="82" height="16" rx="8" fill="#ff2336"/>
          </g>

          <g className="badge">
            <ellipse className="badge-ring" cx="960" cy="500" rx="300" ry="178"
                     fill="none" stroke="rgba(255,35,58,.58)" strokeWidth="4"/>
            <rect x="790" y="322" width="340" height="340" rx="84"
                  fill="url(#badgeFill)" stroke="url(#badgeStroke)" strokeWidth="3" filter="url(#glassSoft)"/>
            <rect x="815" y="347" width="290" height="290" rx="70"
                  fill="rgba(0,0,0,.34)" stroke="rgba(255,255,255,.10)" strokeWidth="2"/>
            <rect className="glass-highlight" x="806" y="332" width="78" height="320" rx="40"
                  fill="rgba(255,255,255,.11)" transform="rotate(-18 845 492)"/>
            <path d="M830 390 C900 340, 1020 340, 1090 400"
                  fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" strokeLinecap="round"/>

            <text className="n-outline" x="960" y="592" textAnchor="middle"
                  fontFamily="Arial Black, Impact, Inter, Arial, sans-serif"
                  fontSize="370" fontWeight="900">N</text>
            <text className="n-fill" x="960" y="592" textAnchor="middle"
                  fontFamily="Arial Black, Impact, Inter, Arial, sans-serif"
                  fontSize="370" fontWeight="900"
                  fill="url(#nFill)" stroke="url(#nStroke)" strokeWidth="7"
                  paintOrder="stroke fill" mask="url(#nFillMask)" filter="url(#premiumGlow)">N</text>

            <g className="n-depth" clipPath="url(#nClip)">
              <path d="M805 300 L1172 690" stroke="rgba(255,255,255,.40)" strokeWidth="40"/>
              <path d="M1006 290 L1250 704" stroke="rgba(0,0,0,.38)" strokeWidth="82"/>
              <rect x="745" y="292" width="440" height="440" fill="url(#metal)" opacity=".42"/>
            </g>
            <path className="n-energy"
                  d="M862 378 C935 450, 1006 520, 1080 606"
                  fill="none" stroke="rgba(255, 92, 105, .72)" strokeWidth="5" strokeLinecap="round"
                  clipPath="url(#nClip)"/>
            <path className="n-play" d="M1032 521 L1118 580 L1032 636 Z" fill="rgba(9,0,3,.70)"/>
            <rect className="n-shine" x="715" y="285" width="110" height="490" rx="24"
                  fill="rgba(255,255,255,.34)" transform="rotate(-16 770 545)" clipPath="url(#nClip)"/>
          </g>

          <g className="brand">
            <ellipse className="brand-glow" cx="960" cy="756" rx="400" ry="62" fill="url(#brandGlowFill)"/>
            <g fontFamily="Inter, Arial, sans-serif" fontSize="104" fontWeight="900" letterSpacing="8" textAnchor="middle">
              <text className="letter l1" x="620" y="770" fill="url(#titleRed)">N</text>
              <text className="letter l2" x="710" y="770" fill="url(#titleRed)">E</text>
              <text className="letter l3" x="800" y="770" fill="url(#titleRed)">T</text>
              <text className="letter l4" x="910" y="770" fill="url(#titleSilver)">P</text>
              <text className="letter l5" x="1010" y="770" fill="url(#titleSilver)">L</text>
              <text className="letter l6" x="1110" y="770" fill="url(#titleSilver)">A</text>
              <text className="letter l7" x="1220" y="770" fill="url(#titleSilver)">Y</text>
            </g>
            <rect className="brand-shine" x="500" y="680" width="120" height="130" rx="18"
                  fill="rgba(255,255,255,.50)" transform="rotate(-14 560 745)" clipPath="url(#titleClip)"/>
            <path className="brand-line" d="M715 797 Q960 812 1205 797"
                  fill="none" stroke="rgba(255, 40, 58, .84)" strokeWidth="4" strokeLinecap="round"/>
            <g opacity=".10" transform="translate(0 837) scale(1 -.25)">
              <text x="960" y="0" textAnchor="middle"
                    fontFamily="Inter, Arial, sans-serif" fontSize="104" fontWeight="900" letterSpacing="8">
                <tspan fill="#ff2738">NET</tspan><tspan fill="#ffffff">PLAY</tspan>
              </text>
            </g>
          </g>

          <text className="subtitle" x="960" y="842" textAnchor="middle"
                fontFamily="Inter, Arial, sans-serif" fontSize="23" fontWeight="600"
                letterSpacing="8" fill="rgba(255,255,255,.84)">
            CATÁLOGO PREMIUM • ENTRETENIMENTO
          </text>

          <g className="micro-tag">
            <rect x="800" y="205" width="320" height="42" rx="21"
                  fill="rgba(0,0,0,.36)" stroke="rgba(255,255,255,.12)"/>
            <text x="960" y="232" textAnchor="middle"
                  fontFamily="Inter, Arial, sans-serif" fontSize="15" fontWeight="800"
                  letterSpacing="5" fill="rgba(255,255,255,.76)">NETPLAY ORIGINAL</text>
          </g>

          <rect className="final-flash" x="0" y="0" width="1920" height="1080" fill="#ffffff"/>
        </svg>

        <div className="content-logo">
          <div className="content-logo-inner">
            <img
              src={DEFAULT_LOGO}
              alt={DEFAULT_TITLE}
              className="content-poster"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="content-title-badge">
              <span className="content-title-text">{DEFAULT_TITLE}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

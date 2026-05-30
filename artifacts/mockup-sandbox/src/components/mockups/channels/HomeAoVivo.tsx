import { useState, useEffect } from "react";

interface Channel {
  id: string;
  name: string;
  logo?: string;
  category?: string;
  num?: number;
  stream_url?: string;
  image?: string;
}

interface Epg {
  channel_id?: string;
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  category?: string;
}

const CATEGORIES = ["Todos", "Esportes", "Abertos", "Notícias", "Filmes", "Infantil"];

const HERO_CHANNELS = [
  {
    id: "hero1",
    name: "ESPN",
    program: "NBA Finals — Jogo 4",
    subtitle: "Lakers vs Celtics",
    viewers: "12 mil",
    badge: "AO VIVO",
    category: "Esportes",
    gradient: ["#1a0000", "#0d0d0d"],
    accent: "#e30000",
    bg: "from-red-950/80 via-zinc-950 to-zinc-950",
    img: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80",
  },
  {
    id: "hero2",
    name: "BAND SPORTS",
    program: "Mundo PBR",
    subtitle: "Montaria ao Vivo",
    viewers: "8.3 mil",
    badge: "AO VIVO",
    category: "Esportes",
    gradient: ["#0a0a1a", "#0d0d0d"],
    accent: "#e30000",
    bg: "from-blue-950/80 via-zinc-950 to-zinc-950",
    img: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&q=80",
  },
  {
    id: "hero3",
    name: "GLOBO",
    program: "Jornal da Globo",
    subtitle: "Edição ao Vivo",
    viewers: "12.6 mil",
    badge: "AO VIVO",
    category: "Notícias",
    gradient: ["#001a00", "#0d0d0d"],
    accent: "#00cc44",
    bg: "from-green-950/80 via-zinc-950 to-zinc-950",
    img: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80",
  },
];

const MOCK_CHANNELS = [
  { id: "c1", name: "ESPN", logo: "ESPN", category: "Esportes", program: "NBA Finals", subtitle: "Lakers vs Celtics", viewers: "+12 mil", progress: 78, quality: "HD", time: "2º Tempo • AO VIVO", accent: "#e30000" },
  { id: "c2", name: "BAND SPORTS", logo: "BAND", category: "Esportes", program: "Mundo PBR", subtitle: "Montaria ao vivo", viewers: "8.3 mil", progress: 55, quality: "HD", time: "22 min restantes", accent: "#ff6600" },
  { id: "c3", name: "CazéTV", logo: "CAZÉ", category: "Esportes", program: "CazéTV 1", subtitle: "Programa ao vivo", viewers: "5.7 mil", progress: 40, quality: "HD", time: "Entretenimento", accent: "#00aaff" },
  { id: "c4", name: "COMBATE", logo: "CMB", category: "Esportes", program: "Sessão Combate", subtitle: "UFC Fight Night", viewers: "6.2 mil", progress: 62, quality: "HD", time: "18 min restantes", accent: "#cc0000" },
  { id: "c5", name: "Disney Channel", logo: "DC", category: "Infantil", program: "Disney Channel", subtitle: "Miraculous: As Aventuras", viewers: "3.1 mil", progress: 30, quality: "HD", time: "Infantil", accent: "#0055ff" },
  { id: "c6", name: "Globo", logo: "GLB", category: "Notícias", program: "Jornal da Globo", subtitle: "Edição ao vivo", viewers: "12.6 mil", progress: 85, quality: "HD", time: "Notícias", accent: "#00aa44" },
];

export function HomeAoVivo() {
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [heroIndex, setHeroIndex] = useState(0);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setHeroIndex(i => (i + 1) % HERO_CHANNELS.length), 5000);
    const p = setInterval(() => setPulse(v => !v), 800);
    return () => { clearInterval(t); clearInterval(p); };
  }, []);

  const hero = HERO_CHANNELS[heroIndex];
  const filtered = activeCategory === "Todos" ? MOCK_CHANNELS : MOCK_CHANNELS.filter(c => c.category === activeCategory);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-y-auto font-sans" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* HERO SECTION */}
      <div className="relative w-full h-[340px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-1000"
          style={{ backgroundImage: `url(${hero.img})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/80 to-transparent" />

        {/* Red glow */}
        <div
          className="absolute bottom-0 left-0 w-64 h-32 rounded-full blur-3xl transition-opacity duration-700"
          style={{ background: `${hero.accent}30`, opacity: pulse ? 0.6 : 1 }}
        />

        {/* Hero Content */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pb-6">
          {/* Live badge */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-md">
              <div className={`w-1.5 h-1.5 rounded-full bg-white ${pulse ? 'opacity-100' : 'opacity-40'}`} />
              <span className="text-white text-[10px] font-bold tracking-widest">AO VIVO AGORA</span>
            </div>
            <span className="text-white/60 text-[10px] font-medium">{heroIndex + 1}/{HERO_CHANNELS.length}</span>
          </div>

          {/* Title */}
          <div className="mb-1">
            <span className="text-[10px] font-bold tracking-widest text-white/50 uppercase">{hero.name}</span>
          </div>
          <h1 className="text-2xl font-black leading-tight mb-1 tracking-tight">{hero.program}</h1>
          <p className="text-white/70 text-sm font-medium mb-2">{hero.subtitle}</p>

          {/* Viewers */}
          <div className="flex items-center gap-1.5 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-white/60 text-xs">{hero.viewers} assistindo</span>
          </div>

          {/* CTA Buttons */}
          <div className="flex gap-2">
            <button
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${hero.accent}, ${hero.accent}cc)`, boxShadow: `0 0 20px ${hero.accent}50` }}
            >
              <span>▶</span> Assistir Agora
            </button>
            <button className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-white/90 text-sm font-semibold">
              Sinopse
            </button>
            <button className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-white/70 text-sm font-semibold">
              ☆
            </button>
          </div>
        </div>

        {/* Dots */}
        <div className="absolute top-12 right-4 flex flex-col gap-1.5">
          {HERO_CHANNELS.map((_, i) => (
            <div key={i} className={`rounded-full transition-all duration-300 ${i === heroIndex ? 'w-1 h-4 bg-red-500' : 'w-1 h-1 bg-white/30'}`} />
          ))}
        </div>
      </div>

      {/* CANAIS AO VIVO SECTION */}
      <div className="px-4 mt-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full bg-red-500 ${pulse ? 'opacity-100' : 'opacity-30'}`} />
            <span className="text-white text-sm font-bold tracking-wide">CANAIS AO VIVO</span>
          </div>
          <span className="text-red-500 text-xs font-semibold">Ver todos →</span>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none -mx-4 px-4">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-red-600 text-white'
                  : 'bg-white/8 text-white/60 border border-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Channel Cards */}
        <div className="grid grid-cols-2 gap-3 pb-6">
          {filtered.map(ch => (
            <div
              key={ch.id}
              className="rounded-2xl border border-white/8 overflow-hidden relative"
              style={{ background: 'linear-gradient(135deg, #1a1a1a, #111)' }}
            >
              {/* Top Row */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black"
                    style={{ background: `${ch.accent}22`, color: ch.accent, border: `1px solid ${ch.accent}40` }}
                  >
                    {ch.logo}
                  </div>
                  <div
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                    style={{ background: `${ch.accent}25`, border: `1px solid ${ch.accent}40` }}
                  >
                    <div className={`w-1 h-1 rounded-full ${pulse ? 'opacity-100' : 'opacity-20'}`} style={{ background: ch.accent }} />
                    <span className="text-[8px] font-bold" style={{ color: ch.accent }}>AO VIVO</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-white/40 text-[9px]">👁</span>
                  <span className="text-white/50 text-[9px] font-medium">{ch.viewers}</span>
                </div>
              </div>

              {/* Program Info */}
              <div className="px-3 pb-2">
                <p className="text-white text-xs font-bold leading-tight">{ch.program}</p>
                <p className="text-white/50 text-[10px] mt-0.5 leading-tight">{ch.subtitle}</p>
                <p className="text-white/30 text-[9px] mt-1">{ch.time}</p>
              </div>

              {/* Progress Bar */}
              <div className="px-3 pb-1">
                <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${ch.progress}%`, background: `linear-gradient(90deg, ${ch.accent}, ${ch.accent}aa)`, boxShadow: `0 0 6px ${ch.accent}` }}
                  />
                </div>
              </div>

              {/* Bottom */}
              <div className="flex items-center justify-between px-3 py-2 border-t border-white/5">
                <span className="text-white/30 text-[9px] font-medium">{ch.quality}</span>
                <button
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs active:scale-90 transition-transform"
                  style={{ background: `linear-gradient(135deg, ${ch.accent}, ${ch.accent}bb)`, boxShadow: `0 0 10px ${ch.accent}50` }}
                >
                  ▶
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

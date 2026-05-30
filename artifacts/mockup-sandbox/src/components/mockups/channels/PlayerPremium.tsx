import { useState, useEffect } from "react";

const RELATED = [
  { name: "ESPN 2", logo: "ESPN2", accent: "#e30000", live: true },
  { name: "TNT Sports", logo: "TNT", accent: "#9900cc", live: true },
  { name: "SporTV", logo: "STV", accent: "#006fd4", live: true },
  { name: "Band Sports", logo: "BAND", accent: "#ff6600", live: true },
];

const TAB_ITEMS = ["Canais", "Programação", "Adicionar", "Compartilhar"];

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function PlayerPremium() {
  const [showControls, setShowControls] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0.42);
  const [currentTime, setCurrentTime] = useState(5805); // 1:36:45
  const totalTime = 8400; // 2:20:00
  const [activeTab, setActiveTab] = useState("Canais");
  const [immersive, setImmersive] = useState(false);
  const [pulse, setPulse] = useState(true);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (playing && !dragging) {
      const t = setInterval(() => setCurrentTime(c => Math.min(c + 1, totalTime)), 1000);
      return () => clearInterval(t);
    }
  }, [playing, dragging]);

  useEffect(() => {
    setProgress(currentTime / totalTime);
  }, [currentTime]);

  useEffect(() => {
    const p = setInterval(() => setPulse(v => !v), 800);
    return () => clearInterval(p);
  }, []);

  useEffect(() => {
    if (showControls && playing) {
      const t = setTimeout(() => setShowControls(false), 3500);
      return () => clearTimeout(t);
    }
  }, [showControls, playing]);

  return (
    <div
      className="min-h-screen bg-black text-white relative overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
      onClick={() => setShowControls(v => !v)}
    >
      {/* VIDEO BG */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80"
          alt="stream"
          className="w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/70" />
      </div>

      {/* IMMERSIVE TOGGLE */}
      {!immersive && (
        <button
          onClick={(e) => { e.stopPropagation(); setImmersive(true); }}
          className="absolute top-14 right-4 z-50 px-3 py-1.5 rounded-xl text-[10px] font-bold backdrop-blur-md border border-white/20 text-white/80"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          MODO IMERSIVO ✦
        </button>
      )}
      {immersive && (
        <button
          onClick={(e) => { e.stopPropagation(); setImmersive(false); }}
          className="absolute top-14 right-4 z-50 px-3 py-1.5 rounded-xl text-[10px] font-bold backdrop-blur-md border border-white/20 text-white/80"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          ✕ SAIR
        </button>
      )}

      {/* TOP HUD */}
      <div
        className={`absolute top-0 left-0 right-0 z-40 transition-all duration-500 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)" }}
      >
        <div className="flex items-center justify-between px-4 pt-12 pb-4">
          <button className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
            <span className="text-white text-sm">←</span>
          </button>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-md">
                <div className={`w-1.5 h-1.5 rounded-full bg-white ${pulse ? 'opacity-100' : 'opacity-30'}`} />
                <span className="text-white text-[9px] font-bold tracking-widest">AO VIVO</span>
              </div>
              <span className="text-white/70 text-[10px] font-semibold">ESPN</span>
            </div>
            <span className="text-white text-sm font-bold mt-0.5">NBA Finals — Jogo 4</span>
            <span className="text-white/50 text-[10px] mt-0.5">Lakers vs Celtics</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-2 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10">
              <span className="text-white text-[10px] font-bold">4K</span>
            </div>
            <button className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10">
              <span className="text-white text-sm">⚙</span>
            </button>
          </div>
        </div>
      </div>

      {/* CENTER CONTROLS */}
      <div
        className={`absolute inset-0 z-40 flex items-center justify-center gap-10 transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setCurrentTime(c => Math.max(0, c - 10)); }}
          className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex flex-col items-center justify-center border border-white/15 active:scale-90 transition-transform"
        >
          <span className="text-white text-lg leading-none">↺</span>
          <span className="text-white/60 text-[9px] font-bold">10</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setPlaying(v => !v); }}
          className="w-18 h-18 rounded-full flex items-center justify-center active:scale-90 transition-transform"
          style={{
            width: 72, height: 72,
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(20px)",
            border: "2px solid rgba(255,255,255,0.25)",
            boxShadow: "0 0 40px rgba(255,255,255,0.1)"
          }}
        >
          <span className="text-white text-2xl">{playing ? "⏸" : "▶"}</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setCurrentTime(c => Math.min(totalTime, c + 10)); }}
          className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md flex flex-col items-center justify-center border border-white/15 active:scale-90 transition-transform"
        >
          <span className="text-white text-lg leading-none">↻</span>
          <span className="text-white/60 text-[9px] font-bold">10</span>
        </button>
      </div>

      {/* BOTTOM HUD */}
      {!immersive && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-40 transition-all duration-500`}
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.97), rgba(0,0,0,0.6) 60%, transparent)" }}
        >
          {/* PROGRESS BAR */}
          <div className={`px-4 mb-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-70'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white/70 text-[11px] font-mono tabular-nums">{formatTime(currentTime)}</span>
              <span className="text-white/50 text-[11px] font-mono tabular-nums">{formatTime(totalTime)} • AO VIVO</span>
            </div>
            <div
              className="relative h-1 rounded-full cursor-pointer group"
              style={{ background: "rgba(255,255,255,0.2)" }}
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const p = (e.clientX - rect.left) / rect.width;
                setProgress(p);
                setCurrentTime(Math.floor(p * totalTime));
              }}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all"
                style={{
                  width: `${progress * 100}%`,
                  background: "linear-gradient(90deg, #e30000, #ff4444)",
                  boxShadow: "0 0 8px #e3000080"
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progress * 100}% - 6px)`, boxShadow: "0 0 8px rgba(255,255,255,0.5)" }}
              />
            </div>
          </div>

          {/* BOTTOM TABS */}
          <div className="border-t border-white/10 px-2 pb-8 pt-3">
            <div className="flex justify-around">
              {TAB_ITEMS.map(tab => (
                <button
                  key={tab}
                  onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
                  className="flex flex-col items-center gap-1 px-3 py-1"
                >
                  <span className="text-lg">{tab === "Canais" ? "📺" : tab === "Programação" ? "📅" : tab === "Adicionar" ? "➕" : "↗"}</span>
                  <span className={`text-[10px] font-semibold ${activeTab === tab ? 'text-red-500' : 'text-white/40'}`}>{tab}</span>
                </button>
              ))}
            </div>
          </div>

          {/* RELATED CHANNELS */}
          {activeTab === "Canais" && (
            <div
              className="absolute bottom-[76px] left-0 right-0 px-4 py-3 border-t border-white/8"
              style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-white/70 text-[10px] font-bold tracking-widest uppercase mb-2.5">Canais Relacionados</p>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                {RELATED.map(ch => (
                  <div key={ch.name} className="flex-shrink-0 flex flex-col items-center gap-1.5">
                    <div
                      className="w-16 h-10 rounded-xl flex items-center justify-center text-[9px] font-black relative overflow-hidden"
                      style={{ background: `${ch.accent}20`, border: `1px solid ${ch.accent}50` }}
                    >
                      <span style={{ color: ch.accent }}>{ch.logo}</span>
                      {ch.live && (
                        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                      )}
                    </div>
                    <span className="text-white/50 text-[9px] font-medium text-center leading-tight max-w-[60px]">{ch.name}</span>
                    <div className="flex items-center gap-0.5">
                      <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-400 text-[8px] font-bold">AO VIVO</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* IMMERSIVE mode overlay */}
      {immersive && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center z-50">
          <div className="px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
            <span className="text-white/60 text-[10px] font-semibold">Modo Imersivo Ativo • Toque para controles</span>
          </div>
        </div>
      )}
    </div>
  );
}

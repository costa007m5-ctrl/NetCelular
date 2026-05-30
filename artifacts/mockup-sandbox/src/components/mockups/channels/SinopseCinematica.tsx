import { useState } from "react";

const PROGRAM = {
  channel: "BAND SPORTS",
  channelLogo: "BAND",
  accent: "#ff6600",
  title: "Mundo PBR",
  genre: "Esportes",
  quality: "HD 1080p",
  transmission: "Ao Vivo",
  rating: "L",
  remaining: "22 min restantes",
  viewers: "8.3 mil",
  language: "Português",
  narrator: "Rodrigo Petersen",
  synopsis:
    "Acompanhe os maiores eventos de montaria em touros do mundo com transmissões exclusivas ao vivo, entrevistas com os campeões e muito mais adrenalina. Uma experiência única para os fãs do esporte mais radical do Brasil.",
  nextPrograms: [
    { time: "23:30", title: "PBR Highlights", duration: "30 min" },
    { time: "00:00", title: "Arena Bruta", duration: "60 min" },
    { time: "01:00", title: "PBR – Melhores Montarias", duration: "60 min" },
  ],
  backdropUrl:
    "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=900&q=80",
};

export function SinopseCinematica() {
  const [favorited, setFavorited] = useState(false);
  const [pulse, setPulse] = useState(true);

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white overflow-y-auto relative"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* BACKDROP */}
      <div className="relative w-full h-[320px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${PROGRAM.backdropUrl})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent" />

        {/* Glow */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-72 h-24 blur-3xl rounded-full"
          style={{ background: `${PROGRAM.accent}25` }}
        />

        {/* Top Nav */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-12">
          <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
            <span className="text-white text-sm">←</span>
          </button>
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
              <span className="text-white text-sm">⊹</span>
            </button>
            <button className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
              <span className="text-white text-sm">⋮</span>
            </button>
          </div>
        </div>

        {/* Channel Logo + Badge */}
        <div className="absolute bottom-8 left-5 flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-xs font-black border"
            style={{
              background: `${PROGRAM.accent}20`,
              borderColor: `${PROGRAM.accent}50`,
              color: PROGRAM.accent,
            }}
          >
            {PROGRAM.channelLogo}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md"
                style={{ background: `${PROGRAM.accent}30`, border: `1px solid ${PROGRAM.accent}50` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-bold tracking-widest" style={{ color: PROGRAM.accent }}>
                  AO VIVO
                </span>
              </div>
              <span className="text-white/50 text-[10px]">{PROGRAM.viewers} assistindo</span>
            </div>
            <p className="text-white font-bold text-base leading-none">{PROGRAM.channel}</p>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-5 -mt-2">
        {/* Title + Info */}
        <h1 className="text-3xl font-black tracking-tight mb-1">{PROGRAM.title}</h1>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ background: `${PROGRAM.accent}20`, color: PROGRAM.accent, border: `1px solid ${PROGRAM.accent}40` }}
          >
            {PROGRAM.genre}
          </span>
          <span className="text-white/40 text-xs">•</span>
          <span className="text-white/60 text-xs font-medium">Ao Vivo</span>
          <span className="text-white/40 text-xs">•</span>
          <span className="text-white/60 text-xs font-medium">{PROGRAM.quality}</span>
          <span className="text-white/40 text-xs">•</span>
          <span className="text-white/50 text-xs">{PROGRAM.remaining}</span>
        </div>

        {/* Synopsis */}
        <p className="text-white/70 text-sm leading-relaxed mb-5">{PROGRAM.synopsis}</p>

        {/* Details Grid */}
        <div
          className="rounded-2xl p-4 mb-5 grid grid-cols-3 gap-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {[
            { icon: "🗣", label: "Idioma", value: PROGRAM.language },
            { icon: "📺", label: "Qualidade", value: PROGRAM.quality },
            { icon: "📡", label: "Transmissão", value: PROGRAM.transmission },
            { icon: "🎙", label: "Narrador", value: PROGRAM.narrator },
            { icon: "🔒", label: "Classificação", value: PROGRAM.rating },
            { icon: "🕐", label: "Restante", value: PROGRAM.remaining.split(" ")[0] + " min" },
          ].map((d) => (
            <div key={d.label} className="flex flex-col items-center text-center gap-1">
              <span className="text-base">{d.icon}</span>
              <span className="text-white/40 text-[9px] uppercase tracking-wide">{d.label}</span>
              <span className="text-white text-[10px] font-semibold leading-tight">{d.value}</span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-5">
          <button
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm text-white transition-all active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${PROGRAM.accent}, ${PROGRAM.accent}cc)`,
              boxShadow: `0 0 24px ${PROGRAM.accent}40`,
            }}
          >
            <span>▶</span> Assistir Agora
          </button>
          <button
            onClick={() => setFavorited(!favorited)}
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition-all active:scale-95"
            style={{ background: favorited ? `${PROGRAM.accent}30` : "rgba(255,255,255,0.07)", border: `1px solid ${favorited ? PROGRAM.accent + "60" : "rgba(255,255,255,0.1)"}` }}
          >
            {favorited ? "★" : "☆"}
          </button>
          <button
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            ⬇
          </button>
          <button
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm transition-all active:scale-95"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            ↗
          </button>
        </div>

        {/* Next Programs */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-bold">Próximos Programas</span>
            <span style={{ color: PROGRAM.accent }} className="text-xs font-semibold">Ver grade completa →</span>
          </div>
          <div className="flex flex-col gap-2">
            {PROGRAM.nextPrograms.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-3 px-4 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: PROGRAM.accent }}
                  >
                    {p.time}
                  </span>
                  <span className="text-white/80 text-sm font-medium">{p.title}</span>
                </div>
                <span className="text-white/40 text-xs">{p.duration}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

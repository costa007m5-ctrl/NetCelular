import "./sting.css";

const NUM_RINGS  = 12;
const RING_CYCLE = 1600; // ms

// Radii — inner small to outer large (semicircular arches centered at horizon)
const RING_RADII = [38, 72, 112, 160, 215, 278, 348, 425, 510, 600, 700, 810];

interface RingProps {
  radius: number;
  index:  number;
}

function Ring({ radius, index }: RingProps) {
  const size       = radius * 2;
  const phase      = index / NUM_RINGS;
  const startDelay = -(phase * RING_CYCLE); // negative CSS delay → start mid-cycle
  const thickness  = radius < 150 ? 1 : radius < 350 ? 1.5 : 2;
  const glowPx     = Math.min(18, 5 + index);

  return (
    <div
      className="sting-ring"
      style={{
        width:              size,
        height:             size,
        marginLeft:         -radius,
        marginTop:          -radius,
        borderWidth:        thickness,
        boxShadow:          `0 0 ${glowPx}px ${Math.round(glowPx / 2)}px rgba(220,40,40,0.5)`,
        animationDuration:  `${RING_CYCLE}ms`,
        animationDelay:     `${startDelay}ms`,
      }}
    />
  );
}

export default function StingPreview() {
  return (
    <div className="sting-root">
      {/* Deep radial background */}
      <div className="sting-bg" />

      {/* ── Arch rings — overflow clips lower half → semicircular arches ── */}
      <div className="sting-arches">
        {/* Origin sits at center-bottom of arch area; rings center here */}
        <div className="sting-rings-origin">
          {RING_RADII.map((r, i) => (
            <Ring key={i} radius={r} index={i} />
          ))}
        </div>
      </div>

      {/* ── Floor reflection (faint mirrored arches) ─────────────────────── */}
      <div className="sting-floor-reflection">
        <div className="sting-rings-origin">
          {RING_RADII.slice(0, 6).map((r, i) => (
            <Ring key={i} radius={r} index={i} />
          ))}
        </div>
      </div>

      {/* ── Solid floor — covers bottom 41%, hides lower half of rings ───── */}
      <div className="sting-floor" />

      {/* ── Horizon glow line ─────────────────────────────────────────────── */}
      <div className="sting-horizon" />

      {/* ── Logo block (icon + brand name + tagline) ──────────────────────── */}
      <div className="sting-logo">
        <div className="sting-icon-wrap">
          <img className="sting-icon" src="/icon.png" alt="NETPLAY" />
          <div className="sting-icon-glow" />
        </div>
        <div className="sting-brand-wrap">
          <div className="sting-brand-name">
            <span className="sting-net">NET</span>
            <span className="sting-play">PLAY</span>
          </div>
          <div className="sting-tagline">CATÁLOGO PREMIUM • ENTRETENIMENTO</div>
        </div>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <div className="sting-progress-wrap">
        <div className="sting-progress-track">
          <div className="sting-progress-fill" />
        </div>
      </div>
    </div>
  );
}

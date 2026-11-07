import { APARTMENT_NAME } from "@/lib/config";

/**
 * Opening animation: an evening scene where the building draws itself, its
 * lights come on floor by floor and the apartment name rises in. Rendered in
 * the page HTML so it is there on the first paint; it is pure CSS, so it runs
 * and ends even before the app's JavaScript loads. Shown once per visit, on
 * the home page only (see SPLASH_SCRIPT); tap anywhere to skip.
 */

/**
 * Runs in <head> before the page is drawn: hides the splash outside the home
 * page or if it was already shown in this visit, and lets a tap skip it.
 */
export const SPLASH_SCRIPT = `(function(){try{var d=document.documentElement;
if(location.pathname!=="/"||sessionStorage.getItem("apt-splash")){d.setAttribute("data-splash","off");return}
sessionStorage.setItem("apt-splash","1");
document.addEventListener("click",function(e){var s=document.getElementById("splash");if(s&&s.contains(e.target))s.classList.add("splash-skip")},true);
}catch(e){}})();`;

// Window positions (from the app icon), lit from the ground floor up.
const WINDOWS = [
  { x: 186, y: 294 },
  { x: 282, y: 294 },
  { x: 186, y: 236 },
  { x: 282, y: 236 },
  { x: 186, y: 178 },
  { x: 282, y: 178 },
];

const STARS = [
  [12, 14, 2],
  [24, 30, 1.5],
  [80, 12, 2],
  [88, 26, 1.5],
  [68, 20, 1],
  [8, 46, 1],
  [92, 48, 1.5],
  [36, 8, 1],
  [58, 6, 1.5],
  [10, 80, 1],
  [88, 86, 1],
  [50, 18, 1],
];

export function Splash() {
  const words = APARTMENT_NAME.split(/\s+/);
  const main = words.slice(-2);
  const lead = words.slice(0, -2).join(" ");

  return (
    <div id="splash" aria-hidden="true">
      <div className="splash-sky">
        {STARS.map(([x, y, r], i) => (
          <span key={i} className="splash-star" style={{ left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2, animationDelay: `${0.2 + (i % 5) * 0.25}s` }} />
        ))}
      </div>
      <div className="splash-stage">
        <div className="splash-halo" />
        <svg className="splash-building" viewBox="100 80 312 370" width="148" height="176">
          <defs>
            <filter id="splash-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path className="splash-fill" d="M150 420V150l106-44 106 44v270z" />
          {WINDOWS.map((w, i) => (
            <rect key={`d${i}`} x={w.x} y={w.y} width="44" height="34" rx="6" className="splash-window-off" />
          ))}
          <g filter="url(#splash-glow)">
            {WINDOWS.map((w, i) => (
              <rect key={`l${i}`} x={w.x} y={w.y} width="44" height="34" rx="6" className="splash-window" style={{ animationDelay: `${0.85 + i * 0.11}s` }} />
            ))}
            <path className="splash-door" d="M226 420v-56h60v56z" />
          </g>
          <path className="splash-outline" pathLength={1} d="M150 420V150l106-44 106 44v270" />
          <path className="splash-ground" pathLength={1} d="M120 420h272" />
        </svg>
        <div className="splash-text">
          {lead && <p className="splash-lead">{lead}</p>}
          <p className="splash-name">
            {main.map((w, i) => (
              <span key={i} style={{ animationDelay: `${1.25 + i * 0.16}s` }}>
                {w}
              </span>
            ))}
          </p>
          <span className="splash-rule" />
        </div>
      </div>
    </div>
  );
}

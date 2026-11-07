import { APARTMENT_NAME } from "@/lib/config";

/**
 * Opening animation: an evening scene where the building draws itself, its
 * lights come on floor by floor and the apartment name rises in. It is plain
 * HTML + CSS (styles in globals.css), so it shows on the first paint and runs
 * even before the app's JavaScript loads.
 *
 * - SPLASH_SCRIPT (in <head>) hides it unless this is the first page of the
 *   visit and it is the home page without a link target (e.g. a notification
 *   opening /#notices goes straight to the notice), and lets a tap skip it.
 * - SPLASH_NAME_SCRIPT (right after it) swaps in the name from Admin → Settings,
 *   which this device saved last time, so a renamed apartment shows correctly.
 * The markup is set as raw HTML so React leaves it alone when those scripts change it.
 */

export const SPLASH_SCRIPT = `(function(){try{var d=document.documentElement;
if(location.pathname!=="/"||location.hash||sessionStorage.getItem("apt-splash")){d.setAttribute("data-splash","off");return}
sessionStorage.setItem("apt-splash","1");
document.addEventListener("click",function(e){var s=document.getElementById("splash");if(s&&s.contains(e.target))s.classList.add("splash-skip")},true);
}catch(e){}})();`;

const WORD_DELAY = (i: number) => `${(1.25 + i * 0.16).toFixed(2)}s`;

export const SPLASH_NAME_SCRIPT = `(function(){try{
if(document.documentElement.getAttribute("data-splash")==="off")return;
var c=localStorage.getItem("apt-cache-v1");if(!c)return;
var n=((JSON.parse(c)||{}).settings||{}).apartmentName;if(!n||typeof n!=="string")return;
var w=n.trim().split(/\\s+/),lead=document.getElementById("splash-lead"),name=document.getElementById("splash-name");if(!name)return;
lead.textContent=w.slice(0,-2).join(" ");lead.hidden=!lead.textContent;
name.textContent="";w.slice(-2).forEach(function(x,i){var s=document.createElement("span");s.textContent=x;s.style.animationDelay=(1.25+i*0.16).toFixed(2)+"s";name.appendChild(s)});
}catch(e){}})();`;

// Window positions (from the app icon), lit from the ground floor up.
const WINDOWS = [
  [186, 294],
  [282, 294],
  [186, 236],
  [282, 236],
  [186, 178],
  [282, 178],
];

// [left %, top %, radius px]
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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function splashHtml(apartmentName: string): string {
  const words = apartmentName.trim().split(/\s+/);
  const lead = words.slice(0, -2).join(" ");
  const main = words.slice(-2);
  const stars = STARS.map(
    ([x, y, r], i) =>
      `<span class="splash-star" style="left:${x}%;top:${y}%;width:${r * 2}px;height:${r * 2}px;animation-delay:${(0.2 + (i % 5) * 0.25).toFixed(2)}s"></span>`,
  ).join("");
  const dim = WINDOWS.map(([x, y]) => `<rect x="${x}" y="${y}" width="44" height="34" rx="6" class="splash-window-off"/>`).join("");
  const lit = WINDOWS.map(
    ([x, y], i) => `<rect x="${x}" y="${y}" width="44" height="34" rx="6" class="splash-window" style="animation-delay:${(0.85 + i * 0.11).toFixed(2)}s"/>`,
  ).join("");
  return `<div class="splash-sky">${stars}</div>
<div class="splash-stage">
  <div class="splash-halo"></div>
  <svg class="splash-building" viewBox="100 80 312 370" width="148" height="176">
    <defs><filter id="splash-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path class="splash-fill" d="M150 420V150l106-44 106 44v270z"/>
    ${dim}
    <g filter="url(#splash-glow)">${lit}<path class="splash-door" d="M226 420v-56h60v56z"/></g>
    <path class="splash-outline" pathLength="1" d="M150 420V150l106-44 106 44v270"/>
    <path class="splash-ground" pathLength="1" d="M120 420h272"/>
  </svg>
  <div class="splash-text">
    <p id="splash-lead" class="splash-lead"${lead ? "" : " hidden"}>${esc(lead)}</p>
    <p id="splash-name" class="splash-name">${main.map((w, i) => `<span style="animation-delay:${WORD_DELAY(i)}">${esc(w)}</span>`).join("")}</p>
    <span class="splash-rule"></span>
  </div>
</div>`;
}

export function Splash() {
  return (
    <>
      <div id="splash" aria-hidden="true" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: splashHtml(APARTMENT_NAME) }} />
      <script dangerouslySetInnerHTML={{ __html: SPLASH_NAME_SCRIPT }} />
    </>
  );
}

// Renders the app icons (PNG) from an inline SVG using the preinstalled Playwright.
// Usage: node scripts/make-icons.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { writeFileSync } from "node:fs";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0e6f66"/>
  <g transform="translate(256 262) scale(${pad ? 0.74 : 0.92}) translate(-256 -262)">
    <path d="M150 420V150l106-44 106 44v270" fill="#ffffff" opacity="0.14"/>
    <path d="M150 420V150l106-44 106 44v270" fill="none" stroke="#fff" stroke-width="22" stroke-linejoin="round"/>
    <g fill="#fff">
      <rect x="186" y="178" width="44" height="34" rx="6"/><rect x="282" y="178" width="44" height="34" rx="6"/>
      <rect x="186" y="236" width="44" height="34" rx="6"/><rect x="282" y="236" width="44" height="34" rx="6"/>
      <rect x="186" y="294" width="44" height="34" rx="6"/><rect x="282" y="294" width="44" height="34" rx="6"/>
    </g>
    <path d="M226 420v-56h60v56" fill="#fab219"/>
    <path d="M120 420h272" stroke="#fff" stroke-width="22" stroke-linecap="round"/>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [
  ["public/icon-192.png", 192, false],
  ["public/icon-512.png", 512, false],
  ["public/apple-touch-icon.png", 180, true],
  ["public/icon-maskable-512.png", 512, true],
];
for (const [file, size, pad] of shots) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg(pad)}`);
  writeFileSync(file, await page.screenshot({ omitBackground: true, type: "png" }));
}
await browser.close();
console.log("icons written");

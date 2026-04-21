import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const datasetPath = path.resolve(__dirname, "../../server/data/datasets/components.dataset.json");
const outputDir = path.resolve(__dirname, "../public/images/parts");
const manifestPath = path.resolve(__dirname, "../src/utils/partImageManifest.js");

const slugify = (value) => {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const normalize = (value) => {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
};

const shortName = (value, maxLength = 34) => {
  const text = normalize(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}.`;
};

const escapeXml = (value) => {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};

const hashText = (text) => {
  let hash = 0;
  const str = String(text || "");
  for (let index = 0; index < str.length; index += 1) {
    hash = (hash * 31 + str.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const typeTheme = {
  cpu: { accent: "#ff9f1a", accentSoft: "#ffbd66", glow: "#ff9f1a33" },
  gpu: { accent: "#2dd36f", accentSoft: "#96f0b8", glow: "#2dd36f33" },
  motherboard: { accent: "#21c1d6", accentSoft: "#8fe7f1", glow: "#21c1d633" },
  ram: { accent: "#ff4f9a", accentSoft: "#ff9fc7", glow: "#ff4f9a33" },
  storage: { accent: "#54c5ff", accentSoft: "#a8e4ff", glow: "#54c5ff33" },
  psu: { accent: "#f3cf4e", accentSoft: "#f8e7a0", glow: "#f3cf4e33" },
  case: { accent: "#c17dff", accentSoft: "#dfbeff", glow: "#c17dff33" }
};

const fallbackTheme = { accent: "#7fb0ff", accentSoft: "#c9ddff", glow: "#7fb0ff33" };

const partSlug = (part) => `${slugify(part.type)}-${slugify(part.name)}`;

const badgeText = (part) => {
  const name = String(part?.name || "");
  const match = name.match(/(\d{3,5}X?3?D?|\d{1,2}TB|\d{2,4}W|DDR\d)/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return String(part?.type || "PART").toUpperCase();
};

const accentPattern = (variant, accent) => {
  if (variant === 0) {
    return `
      <path d="M196 820 L330 820 L455 705 L575 705" fill="none" stroke="${accent}" stroke-width="16" />
      <path d="M196 620 L280 620 L360 548" fill="none" stroke="${accent}" stroke-width="14" />
      <path d="M196 370 L298 370 L382 448 L516 448" fill="none" stroke="${accent}" stroke-width="12" />
    `;
  }
  if (variant === 1) {
    return `
      <path d="M196 860 L340 860 L430 760 L575 760" fill="none" stroke="${accent}" stroke-width="16" />
      <path d="M196 690 L300 690 L385 612 L575 612" fill="none" stroke="${accent}" stroke-width="14" />
      <path d="M196 485 L320 485 L410 565 L575 565" fill="none" stroke="${accent}" stroke-width="12" />
    `;
  }
  return `
    <path d="M196 855 L304 855 L420 740 L575 740" fill="none" stroke="${accent}" stroke-width="16" />
    <path d="M196 700 L308 700 L382 628 L575 628" fill="none" stroke="${accent}" stroke-width="14" />
    <path d="M196 520 L296 520 L380 590 L575 590" fill="none" stroke="${accent}" stroke-width="12" />
  `;
};

const componentGlyph = (type, accentSoft) => {
  const map = {
    cpu: `<rect x="366" y="452" width="86" height="86" rx="10" fill="none" stroke="${accentSoft}" stroke-width="8" /><rect x="386" y="472" width="46" height="46" rx="6" fill="none" stroke="${accentSoft}" stroke-width="6" />`,
    gpu: `<rect x="340" y="462" width="150" height="58" rx="9" fill="none" stroke="${accentSoft}" stroke-width="8" /><circle cx="383" cy="491" r="14" fill="none" stroke="${accentSoft}" stroke-width="5" /><circle cx="447" cy="491" r="14" fill="none" stroke="${accentSoft}" stroke-width="5" />`,
    motherboard: `<rect x="338" y="448" width="155" height="95" rx="10" fill="none" stroke="${accentSoft}" stroke-width="8" /><rect x="356" y="466" width="42" height="42" rx="6" fill="none" stroke="${accentSoft}" stroke-width="5" />`,
    ram: `<rect x="332" y="476" width="168" height="42" rx="8" fill="none" stroke="${accentSoft}" stroke-width="8" /><line x1="356" y1="520" x2="356" y2="536" stroke="${accentSoft}" stroke-width="4" /><line x1="388" y1="520" x2="388" y2="536" stroke="${accentSoft}" stroke-width="4" /><line x1="420" y1="520" x2="420" y2="536" stroke="${accentSoft}" stroke-width="4" />`,
    storage: `<rect x="334" y="476" width="164" height="42" rx="8" fill="none" stroke="${accentSoft}" stroke-width="8" /><circle cx="476" cy="497" r="4" fill="${accentSoft}" />`,
    psu: `<rect x="336" y="456" width="160" height="84" rx="10" fill="none" stroke="${accentSoft}" stroke-width="8" /><circle cx="390" cy="498" r="24" fill="none" stroke="${accentSoft}" stroke-width="5" />`,
    case: `<rect x="350" y="444" width="132" height="112" rx="12" fill="none" stroke="${accentSoft}" stroke-width="8" /><rect x="366" y="462" width="98" height="76" rx="8" fill="none" stroke="${accentSoft}" stroke-width="4" />`
  };
  return map[type] || map.case;
};

const toSvg = (part) => {
  const theme = typeTheme[part.type] || fallbackTheme;
  const brand = escapeXml(shortName(part.brand, 18).toUpperCase());
  const name = escapeXml(shortName(part.name, 34).toUpperCase());
  const badge = escapeXml(badgeText(part));
  const variant = hashText(`${part.type}|${part.name}|${part.brand}`) % 3;
  const pattern = accentPattern(variant, theme.accent);
  const glyph = componentGlyph(part.type, theme.accentSoft);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200" role="img" aria-label="${escapeXml(part.name)}">
  <defs>
    <linearGradient id="frontGrad" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#27292d" />
      <stop offset="45%" stop-color="#171a1f" />
      <stop offset="100%" stop-color="#11141a" />
    </linearGradient>
    <linearGradient id="sideGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2f3237" />
      <stop offset="100%" stop-color="#12151b" />
    </linearGradient>
    <linearGradient id="topGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a3d42" />
      <stop offset="100%" stop-color="#191d24" />
    </linearGradient>
    <filter id="boxShadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="26" stdDeviation="20" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>

  <rect width="900" height="1200" fill="transparent" />
  <ellipse cx="410" cy="1070" rx="290" ry="48" fill="#00000044" />

  <g filter="url(#boxShadow)">
    <polygon points="200,150 620,95 740,165 320,220" fill="url(#topGrad)" />
    <polygon points="620,95 740,165 740,985 620,920" fill="url(#sideGrad)" />
    <polygon points="200,150 620,95 620,920 200,985" fill="url(#frontGrad)" />
  </g>

  <polygon points="620,95 740,165 740,985 620,920" fill="${theme.glow}" />

  ${pattern}
  ${glyph}

  <text x="226" y="930" font-family="Segoe UI, Arial, sans-serif" font-size="46" font-weight="700" fill="#f4f8ff">${brand}</text>
  <text x="226" y="978" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600" fill="#c5d4ec">${name}</text>

  <text x="580" y="842" font-family="Segoe UI, Arial, sans-serif" font-size="78" font-weight="800" fill="${theme.accent}">${badge}</text>
  <text transform="translate(674 346) rotate(90)" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700" fill="#d8e3f6">${brand}</text>
  <text transform="translate(708 346) rotate(90)" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600" fill="#aebdda">${badge}</text>
</svg>`;
};

const ensureDirectory = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const main = () => {
  const parts = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  ensureDirectory(outputDir);

  const slugs = [];
  for (const part of parts) {
    const slug = partSlug(part);
    const svg = toSvg(part);
    fs.writeFileSync(path.join(outputDir, `${slug}.svg`), svg, "utf8");
    slugs.push(slug);
  }

  const uniqueSlugs = [...new Set(slugs)].sort();
  const manifest = `export const PART_IMAGE_SLUGS = new Set(${JSON.stringify(uniqueSlugs, null, 2)});\n`;
  fs.writeFileSync(manifestPath, manifest, "utf8");

  console.log(`Generated ${uniqueSlugs.length} box-style images.`);
};

main();

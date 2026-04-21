import { PART_IMAGE_SLUGS } from "./partImageManifest";

const paletteByType = {
  cpu: { bg1: "#11213f", bg2: "#1f4f8c", accent: "#8ec5ff", label: "CPU", subtitle: "PROCESSOR" },
  motherboard: {
    bg1: "#102426",
    bg2: "#1c5a57",
    accent: "#93ffea",
    label: "MB",
    subtitle: "MOTHERBOARD"
  },
  ram: { bg1: "#2b1a2b", bg2: "#6a2e71", accent: "#f6a7ff", label: "RAM", subtitle: "MEMORY" },
  gpu: { bg1: "#23161a", bg2: "#6d2231", accent: "#ff9db7", label: "GPU", subtitle: "GRAPHICS" },
  storage: { bg1: "#162523", bg2: "#2e6a62", accent: "#95fff0", label: "SSD", subtitle: "STORAGE" },
  psu: { bg1: "#2a2316", bg2: "#7a5c2a", accent: "#ffe3a0", label: "PSU", subtitle: "POWER SUPPLY" },
  case: { bg1: "#1f2226", bg2: "#415160", accent: "#d7e9ff", label: "CASE", subtitle: "CHASSIS" }
};

const imageCache = new Map();

const truncate = (text, maxLength) => {
  const value = String(text || "").trim();
  if (!value) {
    return "";
  }
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}.` : value;
};

const safeXml = (text) => {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
};

const isPlaceholderUrl = (url) => {
  const value = String(url || "").toLowerCase();
  return value.includes("picsum.photos") || value.includes("placehold.co") || value.includes("dummyimage");
};

const normalize = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const slugify = (value) => {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const getPartSlug = (part) => {
  return `${slugify(part?.type)}-${slugify(part?.name)}`;
};

const getLocalPartImagePath = (part) => {
  const slug = getPartSlug(part);
  if (!slug || !PART_IMAGE_SLUGS.has(slug)) {
    return "";
  }
  return `/images/parts/${slug}.svg`;
};

const iconByType = {
  cpu: `
    <rect x="430" y="245" width="340" height="340" rx="24" fill="none" stroke="currentColor" stroke-width="26"/>
    <rect x="505" y="320" width="190" height="190" rx="18" fill="none" stroke="currentColor" stroke-width="18"/>
    <line x1="430" y1="310" x2="390" y2="310" stroke="currentColor" stroke-width="14"/>
    <line x1="430" y1="390" x2="390" y2="390" stroke="currentColor" stroke-width="14"/>
    <line x1="430" y1="470" x2="390" y2="470" stroke="currentColor" stroke-width="14"/>
    <line x1="430" y1="550" x2="390" y2="550" stroke="currentColor" stroke-width="14"/>
    <line x1="770" y1="310" x2="810" y2="310" stroke="currentColor" stroke-width="14"/>
    <line x1="770" y1="390" x2="810" y2="390" stroke="currentColor" stroke-width="14"/>
    <line x1="770" y1="470" x2="810" y2="470" stroke="currentColor" stroke-width="14"/>
    <line x1="770" y1="550" x2="810" y2="550" stroke="currentColor" stroke-width="14"/>
  `,
  motherboard: `
    <rect x="385" y="220" width="430" height="390" rx="24" fill="none" stroke="currentColor" stroke-width="24"/>
    <rect x="430" y="270" width="150" height="150" rx="16" fill="none" stroke="currentColor" stroke-width="16"/>
    <rect x="610" y="270" width="160" height="50" rx="10" fill="none" stroke="currentColor" stroke-width="12"/>
    <rect x="610" y="340" width="160" height="80" rx="10" fill="none" stroke="currentColor" stroke-width="12"/>
    <rect x="430" y="450" width="340" height="110" rx="14" fill="none" stroke="currentColor" stroke-width="14"/>
  `,
  ram: `
    <rect x="300" y="330" width="600" height="170" rx="30" fill="none" stroke="currentColor" stroke-width="22"/>
    <rect x="350" y="365" width="90" height="70" rx="8" fill="none" stroke="currentColor" stroke-width="10"/>
    <rect x="470" y="365" width="90" height="70" rx="8" fill="none" stroke="currentColor" stroke-width="10"/>
    <rect x="590" y="365" width="90" height="70" rx="8" fill="none" stroke="currentColor" stroke-width="10"/>
    <rect x="710" y="365" width="90" height="70" rx="8" fill="none" stroke="currentColor" stroke-width="10"/>
    <line x1="360" y1="500" x2="360" y2="535" stroke="currentColor" stroke-width="10"/>
    <line x1="440" y1="500" x2="440" y2="535" stroke="currentColor" stroke-width="10"/>
    <line x1="520" y1="500" x2="520" y2="535" stroke="currentColor" stroke-width="10"/>
    <line x1="600" y1="500" x2="600" y2="535" stroke="currentColor" stroke-width="10"/>
    <line x1="680" y1="500" x2="680" y2="535" stroke="currentColor" stroke-width="10"/>
    <line x1="760" y1="500" x2="760" y2="535" stroke="currentColor" stroke-width="10"/>
    <line x1="840" y1="500" x2="840" y2="535" stroke="currentColor" stroke-width="10"/>
  `,
  gpu: `
    <rect x="260" y="300" width="680" height="220" rx="28" fill="none" stroke="currentColor" stroke-width="24"/>
    <circle cx="470" cy="410" r="58" fill="none" stroke="currentColor" stroke-width="16"/>
    <circle cx="730" cy="410" r="58" fill="none" stroke="currentColor" stroke-width="16"/>
    <line x1="920" y1="355" x2="980" y2="355" stroke="currentColor" stroke-width="12"/>
    <line x1="920" y1="410" x2="980" y2="410" stroke="currentColor" stroke-width="12"/>
    <line x1="920" y1="465" x2="980" y2="465" stroke="currentColor" stroke-width="12"/>
  `,
  storage: `
    <rect x="280" y="350" width="640" height="130" rx="20" fill="none" stroke="currentColor" stroke-width="20"/>
    <rect x="340" y="385" width="150" height="60" rx="12" fill="none" stroke="currentColor" stroke-width="10"/>
    <line x1="870" y1="382" x2="870" y2="448" stroke="currentColor" stroke-width="10"/>
    <line x1="840" y1="382" x2="840" y2="448" stroke="currentColor" stroke-width="10"/>
    <line x1="810" y1="382" x2="810" y2="448" stroke="currentColor" stroke-width="10"/>
  `,
  psu: `
    <rect x="360" y="260" width="480" height="320" rx="22" fill="none" stroke="currentColor" stroke-width="24"/>
    <circle cx="530" cy="420" r="90" fill="none" stroke="currentColor" stroke-width="16"/>
    <circle cx="530" cy="420" r="42" fill="none" stroke="currentColor" stroke-width="12"/>
    <rect x="680" y="355" width="110" height="130" rx="10" fill="none" stroke="currentColor" stroke-width="12"/>
  `,
  case: `
    <rect x="390" y="180" width="420" height="460" rx="30" fill="none" stroke="currentColor" stroke-width="24"/>
    <rect x="430" y="230" width="340" height="330" rx="18" fill="none" stroke="currentColor" stroke-width="12"/>
    <circle cx="770" cy="280" r="8" fill="currentColor"/>
    <line x1="420" y1="620" x2="780" y2="620" stroke="currentColor" stroke-width="16"/>
  `
};

const generateTypeSvg = (part) => {
  const type = String(part?.type || "").toLowerCase();
  const theme = paletteByType[type] || {
    bg1: "#1d2432",
    bg2: "#3a4b64",
    accent: "#dce7ff",
    label: "PART",
    subtitle: "COMPONENT"
  };
  const brand = safeXml(truncate(part?.brand || "PCPRO", 24));
  const name = safeXml(truncate(part?.name || "Component", 42));
  const icon = iconByType[type] || iconByType.case;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="${safeXml(
      `${part?.name || "Component"} image`
    )}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${theme.bg1}" />
          <stop offset="100%" stop-color="${theme.bg2}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" />
      <circle cx="1020" cy="120" r="190" fill="${theme.accent}" opacity="0.14" />
      <circle cx="130" cy="800" r="240" fill="${theme.accent}" opacity="0.08" />
      <g style="color:${theme.accent}; opacity:0.95;">
        ${icon}
      </g>
      <rect x="48" y="44" width="228" height="62" rx="14" fill="#0a0f18" fill-opacity="0.52" />
      <text x="70" y="85" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#f7fbff">
        ${theme.label}
      </text>
      <text x="72" y="760" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">
        ${brand}
      </text>
      <text x="72" y="810" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="#d5e4ff">
        ${name}
      </text>
      <text x="72" y="850" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="#afc2de" letter-spacing="2">
        ${theme.subtitle}
      </text>
    </svg>
  `;
};

const generateTypeImageDataUrl = (part) => {
  const key = `${String(part?.type || "").toLowerCase()}|${String(part?.brand || "")}|${String(
    part?.name || ""
  )}`;
  if (imageCache.has(key)) {
    return imageCache.get(key);
  }

  const svg = generateTypeSvg(part);
  const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  imageCache.set(key, dataUrl);
  return dataUrl;
};

export const getPartImage = (part) => {
  if (!part) {
    return "";
  }

  const localImage = getLocalPartImagePath(part);
  if (localImage) {
    return localImage;
  }

  const sourceUrl = String(part.imageUrl || "").trim();
  if (sourceUrl && !isPlaceholderUrl(sourceUrl)) {
    return sourceUrl;
  }

  return generateTypeImageDataUrl(part);
};

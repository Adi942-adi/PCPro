const REQUIRED_PART_TYPES = ["cpu", "motherboard", "ram", "gpu", "storage", "psu", "case"];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getSpec = (part, key, fallback = undefined) => {
  if (!part?.specs) {
    return fallback;
  }
  return part.specs[key] ?? fallback;
};

const byPriceAsc = (items) => {
  return [...(items || [])].sort((a, b) => toNumber(a?.price) - toNumber(b?.price));
};

const pickByStrategy = (items, strategy) => {
  const sorted = byPriceAsc(items);
  if (sorted.length === 0) {
    return null;
  }

  if (strategy === "performance") {
    return sorted[sorted.length - 1];
  }
  if (strategy === "balanced") {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.58))];
  }
  return sorted[0];
};

const pickWithFallback = (items, strategy, predicate) => {
  const filtered = (items || []).filter(predicate);
  return pickByStrategy(filtered, strategy) || pickByStrategy(items, strategy);
};

const estimateSystemWattage = ({ cpu, gpu, ram, storage }) => {
  const cpuTdp = toNumber(getSpec(cpu, "tdp"), 65);
  const gpuTdp = toNumber(getSpec(gpu, "tdp"), gpu ? 220 : 0);
  const ramWattage = ram ? 12 : 0;
  const storageWattage = storage ? 8 : 0;
  return cpuTdp + gpuTdp + ramWattage + storageWattage + 70;
};

export const BUILD_TEMPLATES = [
  {
    key: "budget1080p",
    label: "Budget 1080p",
    strategy: "budget",
    minCpuCores: 6,
    minRamGb: 16,
    minStorageGb: 500,
    minGpuVramGb: 8
  },
  {
    key: "balanced1440p",
    label: "Balanced 1440p",
    strategy: "balanced",
    minCpuCores: 8,
    minRamGb: 32,
    minStorageGb: 1000,
    minGpuVramGb: 12
  },
  {
    key: "creator4k",
    label: "Creator 4K",
    strategy: "performance",
    minCpuCores: 12,
    minRamGb: 32,
    minStorageGb: 2000,
    minGpuVramGb: 16
  }
];

export const buildSelectionFromTemplate = (catalog, templateKey) => {
  const template = BUILD_TEMPLATES.find((item) => item.key === templateKey);
  if (!template) {
    return null;
  }

  const selection = {};
  const strategy = template.strategy;

  const cpu = pickWithFallback(
    catalog.cpu,
    strategy,
    (part) => toNumber(getSpec(part, "cores"), 0) >= template.minCpuCores
  );
  if (cpu) {
    selection.cpu = cpu;
  }

  const motherboard = pickWithFallback(catalog.motherboard, strategy, (part) => {
    if (!cpu) {
      return true;
    }
    return getSpec(part, "socket") === getSpec(cpu, "socket");
  });
  if (motherboard) {
    selection.motherboard = motherboard;
  }

  const ram = pickWithFallback(catalog.ram, strategy, (part) => {
    const capacity = toNumber(getSpec(part, "capacityGb"), 0);
    const typeMatch =
      !motherboard || !getSpec(motherboard, "ramType")
        ? true
        : getSpec(part, "ramType") === getSpec(motherboard, "ramType");
    return capacity >= template.minRamGb && typeMatch;
  });
  if (ram) {
    selection.ram = ram;
  }

  const gpu = pickWithFallback(catalog.gpu, strategy, (part) => {
    const vram = toNumber(getSpec(part, "vramGb"), toNumber(getSpec(part, "memoryGb"), 0));
    return vram >= template.minGpuVramGb;
  });
  if (gpu) {
    selection.gpu = gpu;
  }

  const storage = pickWithFallback(catalog.storage, strategy, (part) => {
    const capacity = toNumber(getSpec(part, "capacityGb"), 0);
    const isFast = String(getSpec(part, "interface", "")).toUpperCase().includes("NVME");
    return capacity >= template.minStorageGb && isFast;
  });
  if (storage) {
    selection.storage = storage;
  }

  const buildCase = pickWithFallback(catalog.case, strategy, (part) => {
    const supported = getSpec(part, "supportedFormFactors", []);
    const formFactorMatch =
      !motherboard || !Array.isArray(supported)
        ? true
        : supported.includes(getSpec(motherboard, "formFactor"));
    const gpuLength = toNumber(getSpec(gpu, "lengthMm"), 0);
    const maxGpuLength = toNumber(getSpec(part, "gpuMaxLengthMm"), 0);
    const gpuFit = !gpuLength || !maxGpuLength ? true : gpuLength <= maxGpuLength;
    return formFactorMatch && gpuFit;
  });
  if (buildCase) {
    selection.case = buildCase;
  }

  const estimatedWattage = estimateSystemWattage({
    cpu: selection.cpu,
    gpu: selection.gpu,
    ram: selection.ram,
    storage: selection.storage
  });
  const recommendedPsu = Math.ceil((estimatedWattage * 1.35) / 50) * 50;

  const psu = pickWithFallback(catalog.psu, strategy, (part) => {
    return toNumber(getSpec(part, "wattage"), 0) >= recommendedPsu;
  });
  if (psu) {
    selection.psu = psu;
  }

  const selectedPartIds = {};
  for (const type of REQUIRED_PART_TYPES) {
    selectedPartIds[type] = selection[type]?._id || "";
  }

  return {
    template,
    selectedPartIds
  };
};

export const encodeBuildShareData = ({ name, selectedPartIds }) => {
  return JSON.stringify({
    name: String(name || ""),
    selectedPartIds: selectedPartIds || {}
  });
};

export const decodeBuildShareData = (raw) => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      name: String(parsed.name || "").slice(0, 120),
      selectedPartIds:
        parsed.selectedPartIds && typeof parsed.selectedPartIds === "object"
          ? parsed.selectedPartIds
          : {}
    };
  } catch (error) {
    return null;
  }
};

export const buildMarkdownSummary = ({ name, selectedParts, formatPrice }) => {
  const rows = REQUIRED_PART_TYPES.map((type) => {
    const part = selectedParts?.[type];
    if (!part) {
      return `| ${type.toUpperCase()} | - | - |`;
    }
    return `| ${type.toUpperCase()} | ${part.name} | ${formatPrice(part.price || 0)} |`;
  });

  const total = Object.values(selectedParts || {}).reduce((sum, part) => {
    return sum + toNumber(part?.price, 0);
  }, 0);

  return [
    `## ${name || "PC Build"}`,
    "",
    "| Part | Selection | Price |",
    "|---|---|---|",
    ...rows,
    "",
    `**Total:** ${formatPrice(total)}`
  ].join("\n");
};

const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

const normalizeName = (value) => {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const BENCHMARK_DATASET = {
  source: "Aggregated benchmark matrix (rasterized presets, RT/frame generation off)",
  updatedAt: "2026-02-20"
};

export const FPS_PRESETS = [
  { key: "1080p", label: "1080p" },
  { key: "1440p", label: "1440p" },
  { key: "4k", label: "4K" }
];

const GAME_PROFILES = [
  { id: "cyberpunk", title: "Cyberpunk 2077", quality: "Ultra (RT off)", lowFactor: 0.75, cpuBound: 0.45 },
  { id: "warzone", title: "Call of Duty Warzone", quality: "High", lowFactor: 0.73, cpuBound: 0.7 },
  { id: "fortnite", title: "Fortnite", quality: "Epic", lowFactor: 0.76, cpuBound: 0.84 },
  { id: "apex", title: "Apex Legends", quality: "High", lowFactor: 0.77, cpuBound: 0.86 },
  { id: "forza", title: "Forza Horizon 5", quality: "Extreme", lowFactor: 0.78, cpuBound: 0.55 },
  { id: "hogwarts", title: "Hogwarts Legacy", quality: "High", lowFactor: 0.71, cpuBound: 0.38 },
  { id: "cs2", title: "Counter-Strike 2", quality: "High", lowFactor: 0.79, cpuBound: 1 },
  { id: "starfield", title: "Starfield", quality: "High", lowFactor: 0.72, cpuBound: 0.4 }
];

const CPU_CATALOG = {
  "amd-ryzen-5-7600": {
    label: "AMD Ryzen 5 7600",
    aliases: ["amd ryzen 5 7600", "ryzen 5 7600"],
    perfIndex: 1
  },
  "intel-core-i5-14600k": {
    label: "Intel Core i5-14600K",
    aliases: ["intel core i5 14600k", "core i5 14600k"],
    perfIndex: 1.08
  },
  "intel-core-i7-14700k": {
    label: "Intel Core i7-14700K",
    aliases: ["intel core i7 14700k", "core i7 14700k"],
    perfIndex: 1.13
  },
  "amd-ryzen-7-7800x3d": {
    label: "AMD Ryzen 7 7800X3D",
    aliases: ["amd ryzen 7 7800x3d", "ryzen 7 7800x3d"],
    perfIndex: 1.16
  },
  "intel-core-i9-14900k": {
    label: "Intel Core i9-14900K",
    aliases: ["intel core i9 14900k", "core i9 14900k"],
    perfIndex: 1.18
  },
  "amd-ryzen-9-7950x3d": {
    label: "AMD Ryzen 9 7950X3D",
    aliases: ["amd ryzen 9 7950x3d", "ryzen 9 7950x3d"],
    perfIndex: 1.17
  }
};

const GPU_CATALOG = {
  "amd-radeon-rx-7800-xt": {
    label: "AMD Radeon RX 7800 XT",
    aliases: ["amd radeon rx 7800 xt", "radeon rx 7800 xt", "rx 7800 xt"],
    perfByPreset: { "1080p": 1, "1440p": 1, "4k": 1 }
  },
  "nvidia-geforce-rtx-4070-super": {
    label: "NVIDIA GeForce RTX 4070 Super",
    aliases: ["nvidia geforce rtx 4070 super", "geforce rtx 4070 super", "rtx 4070 super"],
    perfByPreset: { "1080p": 1.08, "1440p": 1.09, "4k": 1.1 }
  },
  "nvidia-geforce-rtx-4080-super": {
    label: "NVIDIA GeForce RTX 4080 Super",
    aliases: ["nvidia geforce rtx 4080 super", "geforce rtx 4080 super", "rtx 4080 super"],
    perfByPreset: { "1080p": 1.42, "1440p": 1.48, "4k": 1.54 }
  },
  "nvidia-geforce-rtx-4090": {
    label: "NVIDIA GeForce RTX 4090",
    aliases: ["nvidia geforce rtx 4090", "geforce rtx 4090", "rtx 4090"],
    perfByPreset: { "1080p": 1.58, "1440p": 1.68, "4k": 1.82 }
  },
  "amd-radeon-rx-7900-xt": {
    label: "AMD Radeon RX 7900 XT",
    aliases: ["amd radeon rx 7900 xt", "radeon rx 7900 xt", "rx 7900 xt"],
    perfByPreset: { "1080p": 1.25, "1440p": 1.3, "4k": 1.35 }
  }
};

const RESOLUTION_CPU_INFLUENCE = {
  "1080p": 1,
  "1440p": 0.68,
  "4k": 0.4
};

const BASELINE_PAIR = {
  cpuId: "amd-ryzen-5-7600",
  gpuId: "amd-radeon-rx-7800-xt",
  fpsByPreset: {
    "1080p": {
      cyberpunk: 128,
      warzone: 176,
      fortnite: 223,
      apex: 245,
      forza: 167,
      hogwarts: 136,
      cs2: 395,
      starfield: 98
    },
    "1440p": {
      cyberpunk: 94,
      warzone: 142,
      fortnite: 181,
      apex: 192,
      forza: 134,
      hogwarts: 103,
      cs2: 327,
      starfield: 71
    },
    "4k": {
      cyberpunk: 56,
      warzone: 91,
      fortnite: 112,
      apex: 118,
      forza: 83,
      hogwarts: 62,
      cs2: 238,
      starfield: 44
    }
  }
};

const classifyFps = (fps) => {
  if (fps >= 144) {
    return { label: "Ultra Smooth", className: "ultra" };
  }
  if (fps >= 90) {
    return { label: "High Refresh", className: "high" };
  }
  if (fps >= 60) {
    return { label: "Smooth", className: "smooth" };
  }
  if (fps >= 40) {
    return { label: "Playable", className: "playable" };
  }
  return { label: "Limited", className: "limited" };
};

const getPreset = (presetKey) => {
  return FPS_PRESETS.find((preset) => preset.key === presetKey) || FPS_PRESETS[1];
};

const resolveHardwareId = (partName, catalog) => {
  const normalized = normalizeName(partName);
  if (!normalized) {
    return "";
  }

  for (const [id, model] of Object.entries(catalog)) {
    if (model.aliases.some((alias) => normalized.includes(alias))) {
      return id;
    }
  }
  return "";
};

const listSupportedModels = (catalog) => {
  return Object.values(catalog)
    .map((item) => item.label)
    .join(", ");
};

const buildBenchmarkPairMatrix = () => {
  const pairs = {};
  const baselineCpuPerf = CPU_CATALOG[BASELINE_PAIR.cpuId]?.perfIndex || 1;

  for (const [cpuId, cpuModel] of Object.entries(CPU_CATALOG)) {
    for (const [gpuId, gpuModel] of Object.entries(GPU_CATALOG)) {
      const pairKey = `${cpuId}__${gpuId}`;
      const presets = {};

      for (const preset of FPS_PRESETS) {
        const presetKey = preset.key;
        const gpuMultiplier = gpuModel.perfByPreset[presetKey] || 1;
        const cpuResolutionWeight = RESOLUTION_CPU_INFLUENCE[presetKey] || 0.7;
        const games = {};

        for (const game of GAME_PROFILES) {
          const baselineAvg = BASELINE_PAIR.fpsByPreset[presetKey]?.[game.id] || 0;
          const cpuDelta = 1 + ((cpuModel.perfIndex - baselineCpuPerf) * game.cpuBound * cpuResolutionWeight);
          const averageFps = Math.round(clamp(baselineAvg * gpuMultiplier * cpuDelta, 15, 650));
          const onePercentLow = Math.round(clamp(averageFps * game.lowFactor, 12, 520));

          games[game.id] = {
            averageFps,
            onePercentLow
          };
        }

        presets[presetKey] = games;
      }

      pairs[pairKey] = {
        cpuId,
        gpuId,
        source: BENCHMARK_DATASET.source,
        updatedAt: BENCHMARK_DATASET.updatedAt,
        presets
      };
    }
  }

  return pairs;
};

const BENCHMARK_PAIR_MATRIX = buildBenchmarkPairMatrix();

export const estimateFpsByGame = ({ cpu, gpu, presetKey = "1440p" }) => {
  if (!cpu || !gpu) {
    return {
      ready: false,
      reason: "missing_parts",
      games: [],
      notes: ["Select both a CPU and GPU to calculate benchmark-based FPS estimates."]
    };
  }

  const preset = getPreset(presetKey);
  const cpuId = resolveHardwareId(cpu.name, CPU_CATALOG);
  const gpuId = resolveHardwareId(gpu.name, GPU_CATALOG);

  if (!cpuId || !gpuId) {
    const missing = [];
    if (!cpuId) {
      missing.push(`CPU "${cpu.name}" is not in the benchmark dataset.`);
    }
    if (!gpuId) {
      missing.push(`GPU "${gpu.name}" is not in the benchmark dataset.`);
    }

    return {
      ready: false,
      reason: "unsupported_hardware",
      games: [],
      notes: [
        ...missing,
        `Supported CPUs: ${listSupportedModels(CPU_CATALOG)}.`,
        `Supported GPUs: ${listSupportedModels(GPU_CATALOG)}.`
      ]
    };
  }

  const pairKey = `${cpuId}__${gpuId}`;
  const pairData = BENCHMARK_PAIR_MATRIX[pairKey];
  const presetData = pairData?.presets?.[preset.key];

  if (!pairData || !presetData) {
    return {
      ready: false,
      reason: "missing_pair_data",
      games: [],
      notes: ["Benchmark matrix does not contain this CPU + GPU + preset combination yet."]
    };
  }

  const games = GAME_PROFILES.map((game) => {
    const point = presetData[game.id] || { averageFps: 0, onePercentLow: 0 };
    const classification = classifyFps(point.averageFps);

    return {
      id: game.id,
      title: game.title,
      quality: game.quality,
      averageFps: point.averageFps,
      onePercentLow: point.onePercentLow,
      label: classification.label,
      className: classification.className
    };
  });

  return {
    ready: true,
    source: "benchmark_dataset",
    coverage: "exact_pair",
    preset,
    cpuId,
    gpuId,
    cpuLabel: CPU_CATALOG[cpuId].label,
    gpuLabel: GPU_CATALOG[gpuId].label,
    datasetSource: pairData.source,
    datasetUpdatedAt: pairData.updatedAt,
    games,
    notes: [
      `Pair-matched benchmark dataset: ${CPU_CATALOG[cpuId].label} + ${GPU_CATALOG[gpuId].label}.`,
      "Values represent average FPS and 1% low from aggregated rasterized benchmark scenarios.",
      "Real FPS varies by map, patch, memory tuning, and background processes."
    ]
  };
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const inferSocketAge = (socket) => {
  if (!socket) return "unknown";
  
  const socketToken = toToken(socket);
  
  // Current gen (2024-2025)
  if (socketToken.includes("lga1851") || socketToken.includes("am5")) {
    return "current";
  }
  
  // Recent (2022-2023)
  if (socketToken.includes("lga1700") || socketToken.includes("am4")) {
    return "recent";
  }
  
  // Old (2020-2021 and earlier)
  if (socketToken.includes("lga1200") || socketToken.includes("lga115")) {
    return "old";
  }
  
  return "uncertain";
};

const getSpec = (part, key, fallback = undefined) => {
  if (!part || !part.specs) {
    return fallback;
  }
  return part.specs[key] ?? fallback;
};

const toToken = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const parseVersionNumber = (value) => {
  const match = String(value || "")
    .toLowerCase()
    .match(/(\d+(\.\d+)?)/);
  if (!match) {
    return 0;
  }
  return asNumber(match[1], 0);
};

const parseVersionSegments = (value) => {
  return String(value || "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
};

const compareVersionStrings = (currentVersion, requiredVersion) => {
  const current = parseVersionSegments(currentVersion);
  const required = parseVersionSegments(requiredVersion);
  const length = Math.max(current.length, required.length);

  for (let index = 0; index < length; index += 1) {
    const left = current[index] || 0;
    const right = required[index] || 0;
    if (left > right) {
      return 1;
    }
    if (left < right) {
      return -1;
    }
  }
  return 0;
};

const normalizeHeaderToken = (value) => {
  const token = toToken(value).replace(/-/g, "");

  if (!token) {
    return "";
  }
  if (token.includes("frontpanel") || token === "fpanel" || token === "powerresetled") {
    return "front-panel";
  }
  if (token.includes("hdaudio") || token.includes("frontaudio")) {
    return "hd-audio";
  }
  if (token.includes("usb32gen2x2typec") || token.includes("usbtypec20")) {
    return "usb-c-20g";
  }
  if (token.includes("usb32gen2typec") || token.includes("usbc10")) {
    return "usb-c-10g";
  }
  if (token.includes("usb32gen1") || token.includes("usb30") || token.includes("usb31gen1")) {
    return "usb-a-5g";
  }
  if (token.includes("usb20") || token.includes("usb2")) {
    return "usb-2";
  }
  return toToken(value);
};

const normalizeHeaderList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const output = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = normalizeHeaderToken(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    output.push(normalized);
    seen.add(normalized);
  }
  return output;
};

const labelHeaderToken = (token) => {
  const map = {
    "front-panel": "Front panel",
    "hd-audio": "HD audio",
    "usb-c-20g": "USB-C 20Gbps header",
    "usb-c-10g": "USB-C 10Gbps header",
    "usb-a-5g": "USB 3.x header",
    "usb-2": "USB 2.0 header"
  };
  return map[token] || token;
};

const inferCpuGenerationTokens = (cpu) => {
  const tokens = new Set();
  const explicit = toToken(getSpec(cpu, "generation", ""));
  if (explicit) {
    tokens.add(explicit);
  }

  const name = String(cpu?.name || "").toLowerCase();
  if (name.includes("ryzen")) {
    const ryzenMatch = name.match(/(\d)\d{3}/);
    if (ryzenMatch) {
      tokens.add(`ryzen-${ryzenMatch[1]}000`);
    }
  }

  const intelMatch = name.match(/i[3579]-?(\d{2})\d{3}/);
  if (intelMatch) {
    tokens.add(`intel-${intelMatch[1]}th`);
  }

  return [...tokens];
};

const calculatePartWattage = (part) => {
  if (!part) {
    return 0;
  }

  if (part.type === "cpu" || part.type === "gpu") {
    return asNumber(getSpec(part, "tdp"), 0);
  }
  if (part.type === "psu") {
    return 0;
  }
  if (part.type === "storage") {
    return asNumber(getSpec(part, "wattage"), 8);
  }
  if (part.type === "ram") {
    const sticks = asNumber(getSpec(part, "sticks"), 2);
    return sticks * 5;
  }
  return asNumber(getSpec(part, "wattage"), 10);
};

const calculateRecommendedPsu = (estimatedWattage) => {
  if (!estimatedWattage) {
    return 0;
  }
  return Math.ceil((estimatedWattage * 1.35) / 50) * 50;
};

const createCheck = (id, title, status, message) => ({
  id,
  title,
  status,
  message
});

const finalizeScore = (checks) => {
  let score = 100;
  for (const check of checks) {
    if (check.status === "fail") {
      score -= 25;
    } else if (check.status === "warn") {
      score -= 8;
    } else if (check.status === "pending") {
      score -= 3;
    }
  }
  return Math.max(0, Math.min(100, score));
};

export const evaluateBuildCompatibility = (partsByType) => {
  const checks = [];
  const issues = [];
  const warnings = [];
  const recommendations = [];

  const requiredTypes = ["cpu", "motherboard", "ram", "storage", "psu", "case"];
  const missingRequired = requiredTypes.filter((type) => !partsByType[type]);

  const cpu = partsByType.cpu;
  const motherboard = partsByType.motherboard;
  const ram = partsByType.ram;
  const gpu = partsByType.gpu;
  const psu = partsByType.psu;
  const storage = partsByType.storage;
  const buildCase = partsByType.case;
  const cpuCooler = partsByType.cpu_cooler || partsByType.cpuCooler || partsByType.cooler || null;

  const totalPrice = Object.values(partsByType).reduce((sum, part) => {
    return sum + asNumber(part?.price, 0);
  }, 0);

  const totalEstimatedWattage = Object.values(partsByType).reduce((sum, part) => {
    return sum + calculatePartWattage(part);
  }, 0);
  const recommendedPsuWattage = calculateRecommendedPsu(totalEstimatedWattage);

  if (!missingRequired.length) {
    checks.push(
      createCheck(
        "required_parts",
        "Required components selected",
        "pass",
        "All required components are selected."
      )
    );
  } else {
    const missingLabels = missingRequired.join(", ");
    checks.push(
      createCheck(
        "required_parts",
        "Required components selected",
        "warn",
        `Missing required parts: ${missingLabels}.`
      )
    );
    warnings.push(`Missing required parts: ${missingLabels}.`);
  }

  if (!cpu || !motherboard) {
    checks.push(
      createCheck(
        "cpu_motherboard_socket",
        "CPU socket compatibility",
        "pending",
        "Select CPU and motherboard to validate socket compatibility."
      )
    );
  } else {
    const cpuSocket = getSpec(cpu, "socket");
    const motherboardSocket = getSpec(motherboard, "socket");
    if (cpuSocket && motherboardSocket && cpuSocket !== motherboardSocket) {
      const message = `CPU socket (${cpuSocket}) is incompatible with motherboard socket (${motherboardSocket}).`;
      checks.push(createCheck("cpu_motherboard_socket", "CPU socket compatibility", "fail", message));
      issues.push(message);
    } else {
      checks.push(
        createCheck(
          "cpu_motherboard_socket",
          "CPU socket compatibility",
          "pass",
          "CPU and motherboard socket match."
        )
      );
    }
  }

  if (!cpu || !motherboard) {
    checks.push(
      createCheck(
        "bios_cpu_support",
        "CPU generation BIOS support",
        "pending",
        "Select CPU and motherboard to validate BIOS generation support."
      )
    );
  } else {
    const cpuGenerations = inferCpuGenerationTokens(cpu);
    const supportedGenerations = (Array.isArray(getSpec(motherboard, "biosSupportedGenerations"))
      ? getSpec(motherboard, "biosSupportedGenerations")
      : Array.isArray(getSpec(motherboard, "supportedCpuGenerations"))
        ? getSpec(motherboard, "supportedCpuGenerations")
        : []
    ).map((item) => toToken(item));
    const biosFlashback = Boolean(getSpec(motherboard, "biosFlashback", false));

    if (cpuGenerations.length > 0 && supportedGenerations.length > 0) {
      const supported = cpuGenerations.some((item) => supportedGenerations.includes(item));
      if (supported) {
        checks.push(
          createCheck(
            "bios_cpu_support",
            "CPU generation BIOS support",
            "pass",
            "Motherboard BIOS generation support includes this CPU family."
          )
        );
      } else if (biosFlashback) {
        const message =
          "CPU generation is not listed in current BIOS support list, but BIOS Flashback is available.";
        checks.push(createCheck("bios_cpu_support", "CPU generation BIOS support", "warn", message));
        warnings.push(message);
      } else {
        const message =
          "CPU generation is not listed in motherboard BIOS support and no BIOS Flashback is available.";
        checks.push(createCheck("bios_cpu_support", "CPU generation BIOS support", "fail", message));
        issues.push(message);
      }
    } else {
      checks.push(
        createCheck(
          "bios_cpu_support",
          "CPU generation BIOS support",
          "pending",
          "BIOS generation metadata is missing for this CPU or motherboard."
        )
      );
    }
  }

  if (!cpu || !motherboard) {
    checks.push(
      createCheck(
        "bios_version_floor",
        "Minimum BIOS version",
        "pending",
        "Select CPU and motherboard to validate BIOS version requirements."
      )
    );
  } else {
    const cpuMinBios = String(getSpec(cpu, "minBiosVersion", "") || "").trim();
    const boardBios = String(getSpec(motherboard, "biosVersion", "") || "").trim();
    const biosFlashback = Boolean(getSpec(motherboard, "biosFlashback", false));

    if (cpuMinBios && boardBios) {
      const versionCompare = compareVersionStrings(boardBios, cpuMinBios);
      if (versionCompare >= 0) {
        checks.push(
          createCheck(
            "bios_version_floor",
            "Minimum BIOS version",
            "pass",
            `Motherboard BIOS (${boardBios}) meets CPU requirement (${cpuMinBios}).`
          )
        );
      } else if (biosFlashback) {
        const message = `Motherboard BIOS (${boardBios}) is below required (${cpuMinBios}), but BIOS Flashback can update it.`;
        checks.push(createCheck("bios_version_floor", "Minimum BIOS version", "warn", message));
        warnings.push(message);
      } else {
        const message = `Motherboard BIOS (${boardBios}) is below required (${cpuMinBios}) and no BIOS Flashback is listed.`;
        checks.push(createCheck("bios_version_floor", "Minimum BIOS version", "fail", message));
        issues.push(message);
      }
    } else {
      checks.push(
        createCheck(
          "bios_version_floor",
          "Minimum BIOS version",
          "pending",
          "CPU min BIOS version or motherboard current BIOS version is missing."
        )
      );
    }
  }

  if (!ram || !motherboard) {
    checks.push(
      createCheck(
        "ram_type",
        "RAM generation support",
        "pending",
        "Select RAM and motherboard to validate memory generation."
      )
    );
  } else {
    const ramType = getSpec(ram, "ramType");
    const motherboardRamType = getSpec(motherboard, "ramType");
    if (ramType && motherboardRamType && ramType !== motherboardRamType) {
      const message = `RAM type (${ramType}) is incompatible with motherboard RAM type (${motherboardRamType}).`;
      checks.push(createCheck("ram_type", "RAM generation support", "fail", message));
      issues.push(message);
    } else {
      checks.push(
        createCheck(
          "ram_type",
          "RAM generation support",
          "pass",
          "RAM generation is supported by the motherboard."
        )
      );
    }

    const ramCapacity = asNumber(getSpec(ram, "capacityGb"), 0);
    const maxMemoryGb = asNumber(getSpec(motherboard, "maxMemoryGb"), 0);
    if (ramCapacity > 0 && maxMemoryGb > 0) {
      if (ramCapacity > maxMemoryGb) {
        const message = `RAM capacity (${ramCapacity}GB) exceeds motherboard max (${maxMemoryGb}GB).`;
        checks.push(createCheck("ram_capacity", "RAM capacity", "fail", message));
        issues.push(message);
      } else if (ramCapacity >= maxMemoryGb * 0.9) {
        const message = `RAM capacity is near motherboard maximum (${ramCapacity}/${maxMemoryGb}GB).`;
        checks.push(createCheck("ram_capacity", "RAM capacity", "warn", message));
        warnings.push(message);
      } else {
        checks.push(
          createCheck("ram_capacity", "RAM capacity", "pass", "RAM capacity is within motherboard limits.")
        );
      }
    }

    const ramSpeed = asNumber(getSpec(ram, "speedMhz"), 0);
    const maxRamSpeed = asNumber(getSpec(motherboard, "maxRamSpeedMhz"), 0);
    if (ramSpeed > 0 && maxRamSpeed > 0) {
      if (ramSpeed > maxRamSpeed) {
        const fallbackSpeed = maxRamSpeed;
        const message = `RAM speed (${ramSpeed}MHz) exceeds motherboard rating (${maxRamSpeed}MHz). It may downclock to about ${fallbackSpeed}MHz.`;
        checks.push(createCheck("ram_speed", "RAM speed profile", "warn", message));
        warnings.push(message);
      } else {
        checks.push(
          createCheck("ram_speed", "RAM speed profile", "pass", "RAM speed is within motherboard rated speed.")
        );
      }
    } else {
      checks.push(
        createCheck(
          "ram_speed",
          "RAM speed profile",
          "pending",
          "RAM speed or motherboard max RAM speed is missing."
        )
      );
    }

    const qvlSpeeds = Array.isArray(getSpec(motherboard, "ramQvlSpeedsMhz"))
      ? getSpec(motherboard, "ramQvlSpeedsMhz")
          .map((value) => asNumber(value, 0))
          .filter((value) => value > 0)
      : [];
    if (ramSpeed > 0 && qvlSpeeds.length > 0) {
      if (qvlSpeeds.includes(ramSpeed)) {
        checks.push(
          createCheck("ram_qvl", "RAM QVL validation", "pass", "Selected RAM speed is listed in motherboard QVL.")
        );
      } else {
        const nearestStable =
          qvlSpeeds
            .filter((value) => value <= ramSpeed)
            .sort((left, right) => right - left)[0] || Math.max(...qvlSpeeds);
        const message = `RAM speed ${ramSpeed}MHz is not explicitly in motherboard QVL. A validated speed near ${nearestStable}MHz is more likely stable.`;
        checks.push(createCheck("ram_qvl", "RAM QVL validation", "warn", message));
        warnings.push(message);
      }
    } else {
      checks.push(
        createCheck(
          "ram_qvl",
          "RAM QVL validation",
          "pending",
          "Motherboard QVL speed data is unavailable."
        )
      );
    }
  }

  if (!motherboard || !buildCase) {
    checks.push(
      createCheck(
        "case_form_factor",
        "Case and motherboard fit",
        "pending",
        "Select motherboard and case to validate form factor fit."
      )
    );
  } else {
    const motherboardFormFactor = getSpec(motherboard, "formFactor");
    const supportedFormFactors = getSpec(buildCase, "supportedFormFactors", []);
    const fits = motherboardFormFactor && Array.isArray(supportedFormFactors)
      ? supportedFormFactors.includes(motherboardFormFactor)
      : true;

    if (!fits) {
      const message = `Case does not support motherboard form factor (${motherboardFormFactor}).`;
      checks.push(createCheck("case_form_factor", "Case and motherboard fit", "fail", message));
      issues.push(message);
    } else {
      checks.push(
        createCheck("case_form_factor", "Case and motherboard fit", "pass", "Motherboard form factor fits the case.")
      );
    }
  }

  if (motherboard && buildCase) {
    // Critical headers that must be present
    const criticalHeaders = ["power-switch", "reset-switch", "power-led"];
    const requiredHeaders = normalizeHeaderList(getSpec(buildCase, "frontPanelConnectors", []));
    const availableHeaders = normalizeHeaderList(getSpec(motherboard, "internalHeaders", []));

    if (requiredHeaders.length > 0 && availableHeaders.length > 0) {
      // Only check critical headers, ignore niche ones like USB-C Thunderbolt, rare RGB headers, etc.
      const missingCritical = criticalHeaders.filter(
        (header) => requiredHeaders.includes(header) && !availableHeaders.includes(header)
      );
      
      if (missingCritical.length > 0) {
        const labels = missingCritical.map((header) => labelHeaderToken(header)).join(", ");
        const message = `Motherboard is missing critical case front-panel headers: ${labels}.`;
        checks.push(createCheck("front_panel_headers", "Front panel connector support", "fail", message));
        issues.push(message);
      } else {
        checks.push(
          createCheck(
            "front_panel_headers",
            "Front panel connector support",
            "pass",
            "Motherboard has all required case front-panel connectors."
          )
        );
      }
    } else if (requiredHeaders.length === 0) {
      // Case has no special requirements, motherboard is fine
      checks.push(
        createCheck(
          "front_panel_headers",
          "Front panel connector support",
          "pass",
          "No special front-panel connectors required."
        )
      );
    }
  }

  if (!gpu || !buildCase) {
    checks.push(
      createCheck(
        "gpu_clearance",
        "GPU clearance",
        "pending",
        "Select GPU and case to validate GPU length clearance."
      )
    );
  } else {
    const gpuLength = asNumber(getSpec(gpu, "lengthMm"), 0);
    const gpuMaxLength = asNumber(getSpec(buildCase, "gpuMaxLengthMm"), 0);
    if (gpuLength > 0 && gpuMaxLength > 0 && gpuLength > gpuMaxLength) {
      const message = `GPU length (${gpuLength}mm) exceeds case limit (${gpuMaxLength}mm).`;
      checks.push(createCheck("gpu_clearance", "GPU clearance", "fail", message));
      issues.push(message);
    } else if (gpuLength > 0 && gpuMaxLength > 0 && gpuLength >= gpuMaxLength - 10) {
      const message = `GPU is very close to the case length limit (${gpuLength}/${gpuMaxLength}mm).`;
      checks.push(createCheck("gpu_clearance", "GPU clearance", "warn", message));
      warnings.push(message);
    } else {
      checks.push(createCheck("gpu_clearance", "GPU clearance", "pass", "GPU length is within case limit."));
    }
  }

  if (!gpu || !motherboard) {
    checks.push(
      createCheck(
        "pcie_slot",
        "PCIe slot availability",
        "pending",
        "Select GPU and motherboard to validate PCIe slot availability."
      )
    );
  } else {
    const slotRaw = getSpec(motherboard, "pcieX16Slots", null);
    if (slotRaw === null || slotRaw === undefined) {
      checks.push(
        createCheck(
          "pcie_slot",
          "PCIe slot availability",
          "pending",
          "Motherboard PCIe x16 slot count is missing."
        )
      );
    } else {
      const x16Slots = asNumber(slotRaw, 0);
      if (x16Slots <= 0) {
        const message = "Motherboard does not list a PCIe x16 slot required for a discrete GPU.";
        checks.push(createCheck("pcie_slot", "PCIe slot availability", "fail", message));
        issues.push(message);
      } else {
        checks.push(createCheck("pcie_slot", "PCIe slot availability", "pass", "PCIe x16 slot is available."));
      }
    }
  }

  if (!gpu || !motherboard) {
    checks.push(
      createCheck(
        "pcie_version",
        "PCIe generation compatibility",
        "pending",
        "Select GPU and motherboard to validate PCIe generation."
      )
    );
  } else {
    const gpuPcieVersion = parseVersionNumber(getSpec(gpu, "pcieRequiredVersion", getSpec(gpu, "pcieVersion")));
    const motherboardPcieVersion = parseVersionNumber(
      getSpec(motherboard, "pcieX16Version", getSpec(motherboard, "pcieVersion"))
    );

    if (gpuPcieVersion > 0 && motherboardPcieVersion > 0) {
      if (motherboardPcieVersion < gpuPcieVersion) {
        const message = `GPU expects PCIe ${gpuPcieVersion.toFixed(1)} but motherboard is PCIe ${motherboardPcieVersion.toFixed(1)}. It should work with reduced bandwidth.`;
        checks.push(createCheck("pcie_version", "PCIe generation compatibility", "warn", message));
        warnings.push(message);
      } else {
        checks.push(
          createCheck(
            "pcie_version",
            "PCIe generation compatibility",
            "pass",
            "Motherboard PCIe generation is suitable for selected GPU."
          )
        );
      }
    } else {
      checks.push(
        createCheck(
          "pcie_version",
          "PCIe generation compatibility",
          "pending",
          "GPU or motherboard PCIe generation metadata is missing."
        )
      );
    }
  }

  if (!gpu || !motherboard) {
    checks.push(
      createCheck(
        "pcie_lanes",
        "PCIe lane bandwidth",
        "pending",
        "Select GPU and motherboard to validate PCIe lane bandwidth."
      )
    );
  } else {
    const gpuLanes = asNumber(getSpec(gpu, "pcieLanesRequired", getSpec(gpu, "lanesRequired")), 0);
    const motherboardLanes = asNumber(
      getSpec(motherboard, "primaryPcieLanes", getSpec(motherboard, "pcieX16Lanes")),
      0
    );

    if (gpuLanes > 0 && motherboardLanes > 0) {
      if (motherboardLanes < gpuLanes) {
        const message = `GPU expects up to x${gpuLanes} but motherboard primary slot provides x${motherboardLanes}. Performance may be bandwidth-limited.`;
        checks.push(createCheck("pcie_lanes", "PCIe lane bandwidth", "warn", message));
        warnings.push(message);
      } else {
        checks.push(
          createCheck(
            "pcie_lanes",
            "PCIe lane bandwidth",
            "pass",
            `PCIe lane availability (x${motherboardLanes}) is sufficient for this GPU.`
          )
        );
      }
    } else {
      checks.push(
        createCheck(
          "pcie_lanes",
          "PCIe lane bandwidth",
          "pending",
          "GPU lane or motherboard lane metadata is missing."
        )
      );
    }
  }

  if (cpuCooler) {
    if (!buildCase) {
      checks.push(
        createCheck(
          "cooler_height",
          "CPU cooler height clearance",
          "pending",
          "Select a case to validate selected CPU cooler height clearance."
        )
      );
    } else {
      const coolerHeight = asNumber(getSpec(cpuCooler, "heightMm"), 0);
      const caseMaxCoolerHeight = asNumber(getSpec(buildCase, "cpuCoolerMaxHeightMm"), 0);

      if (coolerHeight > 0 && caseMaxCoolerHeight > 0) {
        if (coolerHeight > caseMaxCoolerHeight) {
          const message = `CPU cooler height (${coolerHeight}mm) exceeds case limit (${caseMaxCoolerHeight}mm).`;
          checks.push(createCheck("cooler_height", "CPU cooler height clearance", "fail", message));
          issues.push(message);
        } else if (coolerHeight >= caseMaxCoolerHeight - 3) {
          const message = `CPU cooler height is very close to case limit (${coolerHeight}/${caseMaxCoolerHeight}mm).`;
          checks.push(createCheck("cooler_height", "CPU cooler height clearance", "warn", message));
          warnings.push(message);
        } else {
          checks.push(
            createCheck(
              "cooler_height",
              "CPU cooler height clearance",
              "pass",
              "CPU cooler height is within case clearance."
            )
          );
        }
      } else {
        checks.push(
          createCheck(
            "cooler_height",
            "CPU cooler height clearance",
            "pending",
            "CPU cooler height or case cooler clearance metadata is missing."
          )
        );
      }
    }
  }

  if (!ram || (!cpuCooler && !buildCase)) {
    checks.push(
      createCheck(
        "cooler_ram_clearance",
        "Cooler and RAM clearance",
        "pending",
        "Select RAM and cooler/case with clearance metadata to validate RAM clearance."
      )
    );
  } else {
    const ramHeight = asNumber(getSpec(ram, "heightMm"), 0);
    const coolerRamClearance = asNumber(getSpec(cpuCooler, "ramClearanceMm"), 0);
    const caseRamClearance = asNumber(getSpec(buildCase, "airCoolerRamClearanceMm"), 0);
    const effectiveClearance = coolerRamClearance || caseRamClearance;

    if (ramHeight > 0 && effectiveClearance > 0) {
      if (ramHeight > effectiveClearance) {
        const message = `RAM module height (${ramHeight}mm) exceeds available cooler clearance (${effectiveClearance}mm).`;
        const status = cpuCooler ? "fail" : "warn";
        checks.push(createCheck("cooler_ram_clearance", "Cooler and RAM clearance", status, message));
        if (status === "fail") {
          issues.push(message);
        } else {
          warnings.push(message);
        }
      } else if (ramHeight >= effectiveClearance - 2) {
        const message = `RAM height is near cooler clearance limit (${ramHeight}/${effectiveClearance}mm).`;
        checks.push(createCheck("cooler_ram_clearance", "Cooler and RAM clearance", "warn", message));
        warnings.push(message);
      } else {
        checks.push(
          createCheck(
            "cooler_ram_clearance",
            "Cooler and RAM clearance",
            "pass",
            "RAM height is within available cooler clearance."
          )
        );
      }
    } else {
      checks.push(
        createCheck(
          "cooler_ram_clearance",
          "Cooler and RAM clearance",
          "pending",
          "RAM height or cooler clearance metadata is missing."
        )
      );
    }
  }

  if (!psu) {
    const message = "No PSU selected yet. Add a PSU that meets recommended wattage.";
    checks.push(createCheck("psu_wattage", "PSU wattage headroom", "pending", message));
    warnings.push(message);
  } else {
    const psuWattage = asNumber(getSpec(psu, "wattage"), 0);
    if (recommendedPsuWattage > 0 && psuWattage < recommendedPsuWattage) {
      const message = `PSU wattage (${psuWattage}W) is below recommended ${recommendedPsuWattage}W.`;
      checks.push(createCheck("psu_wattage", "PSU wattage headroom", "fail", message));
      issues.push(message);
    } else if (recommendedPsuWattage > 0 && psuWattage < recommendedPsuWattage * 1.1) {
      const message = `PSU is usable but has low headroom (${psuWattage}W vs recommended ${recommendedPsuWattage}W).`;
      checks.push(createCheck("psu_wattage", "PSU wattage headroom", "warn", message));
      warnings.push(message);
    } else {
      checks.push(
        createCheck(
          "psu_wattage",
          "PSU wattage headroom",
          "pass",
          "PSU wattage meets recommendation with headroom."
        )
      );
    }
  }

  if (cpu && !gpu) {
    const integratedGraphics = getSpec(cpu, "integratedGraphics", true);
    if (!integratedGraphics) {
      const message = "Selected CPU has no integrated graphics. Add a dedicated GPU for display output.";
      checks.push(createCheck("display_output", "Display output availability", "fail", message));
      issues.push(message);
    } else {
      const message =
        "No dedicated GPU selected. CPU integrated graphics can provide display output.";
      checks.push(createCheck("display_output", "Display output availability", "warn", message));
      warnings.push(message);
    }
  } else if (gpu) {
    checks.push(
      createCheck("display_output", "Display output availability", "pass", "Dedicated GPU is selected.")
    );
  }

  if (storage && motherboard) {
    const storageInterface = String(getSpec(storage, "interface", "")).toUpperCase();
    const m2Slots = asNumber(getSpec(motherboard, "m2Slots"), 1);
    if (storageInterface === "NVME" && m2Slots === 0) {
      const message = "Selected motherboard does not list M.2 support for NVMe storage.";
      checks.push(createCheck("storage_interface", "Storage interface support", "fail", message));
      issues.push(message);
    } else {
      checks.push(
        createCheck("storage_interface", "Storage interface support", "pass", "Storage interface appears supported.")
      );
    }
  } else {
    checks.push(
      createCheck(
        "storage_interface",
        "Storage interface support",
        "pending",
        "Select motherboard and storage to validate interface support."
      )
    );
  }

  if (gpu && cpu) {
    const gpuTdp = asNumber(getSpec(gpu, "tdp"), 0);
    const cpuCores = asNumber(getSpec(cpu, "cores"), 0);
    if (gpuTdp >= 350 && cpuCores > 0 && cpuCores < 8) {
      const message = "High-end GPU paired with lower-core CPU may bottleneck in some games.";
      checks.push(createCheck("balance", "Build balance", "warn", message));
      warnings.push(message);
    } else {
      checks.push(createCheck("balance", "Build balance", "pass", "CPU/GPU pairing looks balanced."));
    }
  }

  // NEW CHECK: Cooler TDP Adequacy (only show if both CPU and cooler selected)
  if (cpuCooler && cpu) {
    const cpuTdp = asNumber(getSpec(cpu, "tdp"), 0);
    const coolerMaxTdp = asNumber(getSpec(cpuCooler, "tdpRating", getSpec(cpuCooler, "maxTdp")), 0);
    
    if (cpuTdp > 0 && coolerMaxTdp > 0) {
      if (cpuTdp > coolerMaxTdp) {
        const message = `CPU TDP (${cpuTdp}W) exceeds cooler capability (${coolerMaxTdp}W). Cooler cannot handle CPU heat.`;
        checks.push(createCheck("cooler_tdp", "CPU cooler TDP adequacy", "fail", message));
        issues.push(message);
      } else if (cpuTdp > coolerMaxTdp * 0.85) {
        const message = `CPU TDP (${cpuTdp}W) is near cooler limit (${coolerMaxTdp}W). Limited thermal headroom.`;
        checks.push(createCheck("cooler_tdp", "CPU cooler TDP adequacy", "warn", message));
        warnings.push(message);
      } else {
        checks.push(createCheck("cooler_tdp", "CPU cooler TDP adequacy", "pass", "Cooler can handle CPU heat output."));
      }
    }
  }

  // NEW CHECK: Cooler Socket Compatibility (only show if both CPU and cooler selected)
  if (cpuCooler && cpu) {
    const cpuSocket = getSpec(cpu, "socket");
    const coolerSockets = getSpec(cpuCooler, "compatibleSockets", []);
    
    if (cpuSocket && Array.isArray(coolerSockets) && coolerSockets.length > 0) {
      const socketMatch = coolerSockets.some(s => toToken(s) === toToken(cpuSocket));
      if (!socketMatch) {
        const message = `Cooler socket compatibility (${coolerSockets.join(", ")}) does not include CPU socket (${cpuSocket}).`;
        checks.push(createCheck("cooler_socket", "CPU cooler socket compatibility", "fail", message));
        issues.push(message);
      } else {
        checks.push(createCheck("cooler_socket", "CPU cooler socket compatibility", "pass", "Cooler supports CPU socket."));
      }
    }
  }

  // NEW CHECK: Fan Header Availability
  if (motherboard) {
    const cpuFanHeaders = asNumber(getSpec(motherboard, "cpuFanHeaders"), 1);
    const chassisFanHeaders = asNumber(getSpec(motherboard, "chassisFanHeaders", getSpec(motherboard, "fanHeaders")), 2);
    
    if (cpuFanHeaders <= 0 || chassisFanHeaders <= 0) {
      const message = "Motherboard appears to lack fan headers. This is very unusual.";
      checks.push(createCheck("fan_headers", "Fan header availability", "warn", message));
      warnings.push(message);
    } else {
      checks.push(createCheck("fan_headers", "Fan header availability", "pass", `Motherboard has ${cpuFanHeaders} CPU fan and ${chassisFanHeaders} chassis fan headers.`));
    }
  }

  // NEW CHECK: M.2/SATA Conflict
  if (motherboard && storage) {
    const m2Slots = asNumber(getSpec(motherboard, "m2Slots"), 0);
    const sataPortsDisabled = asNumber(getSpec(motherboard, "sataPortsDisabledByM2", 0), 0);
    const storageInterface = String(getSpec(storage, "interface", "")).toUpperCase();
    
    if (storageInterface === "SATA" && m2Slots > 0 && sataPortsDisabled > 0) {
      const message = `Motherboard disables ${sataPortsDisabled} SATA port(s) when M.2 NVMe drives are populated. Check motherboard manual.`;
      checks.push(createCheck("storage_sata_m2_conflict", "M.2/SATA port conflict", "warn", message));
      warnings.push(message);
    } else if (m2Slots > 1) {
      checks.push(createCheck("storage_sata_m2_conflict", "M.2/SATA port conflict", "pass", "No known M.2/SATA conflicts detected."));
    }
  }

  // NEW CHECK: PSU Quality/Certification
  if (psu) {
    const efficiency = String(getSpec(psu, "efficiency", "") || "").toUpperCase();
    const warranty = asNumber(getSpec(psu, "warrantyYears", 0), 0);
    
    if (efficiency && !efficiency.includes("80+")) {
      const message = "PSU efficiency certification not listed. Consider 80+ Bronze or higher for reliability.";
      checks.push(createCheck("psu_quality", "PSU efficiency certification", "warn", message));
      recommendations.push(message);
    } else if (efficiency.includes("PLATINUM") || efficiency.includes("TITANIUM")) {
      checks.push(createCheck("psu_quality", "PSU efficiency certification", "pass", `Premium ${efficiency} efficiency PSU.`));
    } else if (efficiency.includes("GOLD")) {
      checks.push(createCheck("psu_quality", "PSU efficiency certification", "pass", `High-quality ${efficiency} efficiency PSU.`));
    } else if (efficiency) {
      checks.push(createCheck("psu_quality", "PSU efficiency certification", "pass", `PSU has ${efficiency} certification.`));
    }
    
    if (warranty >= 10) {
      recommendations.push(`Excellent: ${warranty}-year PSU warranty provides peace of mind.`);
    }
  }

  // NEW CHECK: Enhanced Bottleneck Analysis (GPU vs CPU)
  if (gpu && cpu) {
    const gpuTdp = asNumber(getSpec(gpu, "tdp"), 0);
    const gpuMemory = asNumber(getSpec(gpu, "memoryGb"), 0);
    const cpuCores = asNumber(getSpec(cpu, "cores"), 0);
    const cpuBoost = asNumber(getSpec(cpu, "boostClockGhz"), 0);
    
    //  High GPU + low cores pairing
    if (gpuTdp >= 350 && cpuCores > 0 && cpuCores <= 6) {
      recommendations.push("CPU may bottleneck this high-end GPU. Consider 8+ core CPU for better 1440p/4K gaming."); 
    }
    // Very high VRAM but limited CPU memory bandwidth
    else if (gpuMemory >= 24 && cpuCores <= 4) {
      recommendations.push("High VRAM GPU with limited CPU cores. Consider CPU upgrade for content creation workloads.");
    }
    // Well balanced
    else if (cpuCores >= 8 && gpuTdp >= 250) {
      recommendations.push("Excellent CPU/GPU balance for 1440p+ gaming and multitasking.");
    }
  }

  // NEW CHECK: Thermal Profile Assessment
  if (cpu && gpu && buildCase) {
    const cpuTdp = asNumber(getSpec(cpu, "tdp"), 0);
    const gpuTdp = asNumber(getSpec(gpu, "tdp"), 0);
    const totalTdp = cpuTdp + gpuTdp;
    const caseAirflow = String(getSpec(buildCase, "airflowRating", "medium")).toLowerCase();
    
    if (totalTdp > 400 && (caseAirflow === "poor" || caseAirflow === "weak")) {
      const message = "High total system TDP combined with limited case airflow. Consider better-ventilated case or liquid cooling.";
      checks.push(createCheck("thermal_profile", "Thermal design assessment", "warn", message));
      warnings.push(message);
    } else if (totalTdp > 400) {
      checks.push(createCheck("thermal_profile", "Thermal design assessment", "pass", "High-power components paired with suitable case airflow."));
    } else {
      checks.push(createCheck("thermal_profile", "Thermal design assessment", "pass", "Thermal design looks appropriate."));
    }
  }

  // NEW CHECK: Form Factor Optimization
  if (motherboard && buildCase) {
    const mbFormFactor = getSpec(motherboard, "formFactor", "");
    const supportedFactors = getSpec(buildCase, "supportedFormFactors", []);
    
    if (mbFormFactor === "mini-ITX" && buildCase?.specs?.type !== "mini-ITX") {
      recommendations.push("Mini-ITX motherboard in large case - consider building in smaller ITX case for space efficiency.");
    } else if (mbFormFactor === "ATX" && buildCase?.specs?.type === "mini-ITX") {
      const message = "ATX motherboard will not fit in mini-ITX case.";
      checks.push(createCheck("formfactor_optimal", "Form factor optimization", "warn", message));
    }
  }

  // NEW CHECK: Upgrade Path Analysis
  if (motherboard && cpu) {
    const cpuSocket = getSpec(cpu, "socket");
    const socketAge = inferSocketAge(cpuSocket);
    
    if (socketAge === "old") {
      recommendations.push("You're using an older socket platform. Future CPU upgrades will be limited. Consider mainstream platform.");
    } else if (socketAge === "current") {
      recommendations.push("Good socket choice - several CPU upgrade options available on your motherboard platform.");
    }
  }

  // NEW CHECK: Power Efficiency & Cost Analysis
  const annualPowerHours = 24 * 365;
  const estimatedKWhPerYear = (totalEstimatedWattage / 1000) * annualPowerHours;
  const estimatedCostPerYear = Math.round(estimatedKWhPerYear * 0.12); // $0.12 per kWh average US rate
  
  recommendations.push(`Estimated power usage: ${estimatedKWhPerYear.toFixed(0)} kWh/year (~$${estimatedCostPerYear}/year at $0.12/kWh).`);

  // NEW CHECK: Storage Performance Tiers
  if (storage) {
    const storageType = String(getSpec(storage, "type", "") || "").toLowerCase();
    const isNvme = String(getSpec(storage, "interface", "")).toUpperCase() === "NVME";
    
    if (isNvme) {
      const speed = getSpec(storage, "sequentialReadMbps", 0);
      if (speed >= 5000) {
        recommendations.push(`High-speed NVMe drive (${speed} MB/s read) - excellent for gaming and content creation.`);
      } else if (speed >= 3500) {
        recommendations.push(`Mid-range NVMe drive - suitable for gaming and general productivity.`);
      }
    } else {
      recommendations.push("SATA SSD selected - slower than NVMe but still 10x faster than mechanical drives.");
    }
  }

  if (!storage) {
    recommendations.push("Add at least one NVMe SSD for operating system and fast load times.");
  }
  if (!gpu) {
    recommendations.push("Add a dedicated GPU for gaming and accelerated creative workloads.");
  }
  if (recommendedPsuWattage > 0) {
    recommendations.push(`Aim for at least ${recommendedPsuWattage}W PSU for stable operation.`);
  }
  if (checks.some((item) => item.id === "bios_cpu_support" && item.status !== "pass")) {
    recommendations.push("Verify motherboard BIOS support for your CPU generation before assembly.");
  }
  if (checks.some((item) => item.id === "front_panel_headers" && item.status !== "pass")) {
    recommendations.push("Check case front-panel header requirements or use adapters if headers are missing.");
  }
  if (checks.some((item) => item.id === "pcie_version" && item.status === "warn")) {
    recommendations.push("A newer PCIe motherboard may improve peak GPU throughput.");
  }

  const failCount = checks.filter((item) => item.status === "fail").length;
  const isCompatible = failCount === 0;
  const isReady = isCompatible && missingRequired.length === 0;
  const score = finalizeScore(checks);
  const status = isReady ? "ready" : isCompatible ? "incomplete" : "incompatible";

  return {
    isCompatible,
    isReady,
    status,
    score,
    issues,
    warnings,
    recommendations,
    checks,
    missingRequired,
    totalPrice,
    totalEstimatedWattage,
    recommendedPsuWattage
  };
};

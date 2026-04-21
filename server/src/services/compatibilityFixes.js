import Component from "../models/Component.js";
import logger from "../utils/logger.js";

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Generate fix suggestions for failed/warning checks
 */
export const generateFixSuggestions = async (compatibilityResult, selectedPartIds = {}) => {
  const suggestions = [];
  const { checks, issues, warnings } = compatibilityResult;

  for (const check of checks) {
    if (check.status === "fail" || check.status === "warn") {
      const fix = generateFixForCheck(check.id, check.message, selectedPartIds);
      if (fix) {
        suggestions.push(fix);
      }
    }
  }

  return suggestions;
};

/**
 * Generate specific fix for a check ID
 */
function generateFixForCheck(checkId, message, selectedPartIds) {
  const fixes = {
    cpu_motherboard_socket: {
      title: "Fix CPU Socket Mismatch",
      severity: "critical",
      steps: [
        "Replace the motherboard with one matching your CPU socket",
        "Or replace the CPU with one compatible with your motherboard",
        "Check your CPU model to identify correct socket (e.g., AM5, LGA1700)"
      ],
      alternatives: [
        { label: "Find compatible motherboards", action: "search_motherboard_by_socket" },
        { label: "Find compatible CPUs", action: "search_cpu_by_socket" }
      ]
    },

    bios_cpu_support: {
      title: "CPU Not Supported in Current BIOS",
      severity: "critical",
      steps: [
        "Update motherboard BIOS to latest version",
        "Download BIOS from motherboard manufacturer's official website",
        "Use BIOS Flashback feature if available (doesn't require CPU)",
        "Or use an older compatible CPU temporarily to update BIOS",
        "Then install your desired CPU"
      ],
      alternatives: [
        { label: "Choose older CPU (guaranteed BIOS support)", action: "search_cpu_by_generation" },
        { label: "Choose newer motherboard (newer BIOS)", action: "search_motherboard" }
      ]
    },

    bios_version_floor: {
      title: "Motherboard BIOS Below Minimum Version",
      severity: "critical",
      steps: [
        "Flash/update motherboard BIOS to meet CPU requirements",
        "Visit motherboard manufacturer's support page",
        "Download latest BIOS binary file",
        "Use BIOS Flashback or Q-Flash (check motherboard manual)",
        "Restart after update completes"
      ],
      alternatives: [
        { label: "Find older CPU needing less BIOS", action: "search_cpu_by_generation" }
      ]
    },

    ram_type: {
      title: "RAM Type Incompatible",
      severity: "critical",
      steps: [
        "Replace RAM with matching type",
        "Motherboard requires: Check your motherboard specs",
        "Modern boards support: DDR5 (newest) or DDR4 (older)",
        "Purchase RAM matching your motherboard generation"
      ],
      alternatives: [
        { label: "Find compatible RAM modules", action: "search_ram_by_type" },
        { label: "Find compatible motherboard", action: "search_motherboard" }
      ]
    },

    ram_capacity: {
      title: "RAM Exceeds Motherboard Maximum",
      severity: "critical",
      steps: [
        "Reduce RAM capacity or replace with smaller modules",
        "Check motherboard maximum memory support",
        "For example: If max is 192GB, use 2x96GB or 4x48GB",
        "Consider you don't need maximum capacity for most builds"
      ],
      alternatives: [
        { label: "Find compatible RAM capacity", action: "search_ram_by_capacity" },
        { label: "Find motherboard with higher capacity support", action: "search_motherboard" }
      ]
    },

    ram_speed: {
      title: "RAM Speed Exceeds Motherboard Rating",
      severity: "warning",
      steps: [
        "RAM will automatically downclock to motherboard maximum",
        "This is normal and safe",
        "Performance impact is minimal (2-5% in most workloads)",
        "You can overclock in BIOS if experienced"
      ],
      alternatives: [
        { label: "Find matching speed RAM", action: "search_ram_by_speed" },
        { label: "Find motherboard supporting faster RAM", action: "search_motherboard" }
      ]
    },

    ram_qvl: {
      title: "RAM Speed Not in QVL List",
      severity: "warning",
      steps: [
        "Your RAM speed is not officially validated by motherboard maker",
        "It will likely work at your specified speed",
        "Worst case: downclock to validated speed",
        "Best case: works perfectly at specified speed",
        "Enable XMP/DOCP profile in BIOS for rated speed"
      ],
      alternatives: [
        { label: "Find QVL-validated RAM modules", action: "search_ram_qvl" }
      ]
    },

    case_form_factor: {
      title: "Case Does Not Support Motherboard Form Factor",
      severity: "critical",
      steps: [
        "Choose a case supporting your motherboard size",
        "Choose a motherboard matching your case",
        "Form factors: ATX (full), mATX (medium), mini-ITX (small)",
        "Smaller motherboards fit in larger cases, not vice versa"
      ],
      alternatives: [
        { label: "Find compatible case", action: "search_case_by_formfactor" },
        { label: "Find compatible motherboard", action: "search_motherboard" }
      ]
    },

    front_panel_headers: {
      title: "Motherboard Missing Front Panel Headers",
      severity: "critical",
      steps: [
        "Use USB adapter for missing headers (e.g., USB hub adapter)",
        "OR replace motherboard with one having more headers",
        "OR replace case with one needing fewer headers",
        "Most critical: Power, Reset, Power LED",
        "Less critical: HDD LED, USB headers"
      ],
      alternatives: [
        { label: "Find motherboard with all headers", action: "search_motherboard" },
        { label: "Find case with fewer connector requirements", action: "search_case" }
      ]
    },

    gpu_clearance: {
      title: "GPU Too Long for Case",
      severity: "critical",
      steps: [
        "Choose a shorter GPU or larger case",
        "Check GPU length: usually on product specs",
        "Check case GPU slot clearance: usually side panel to VRM",
        "Some cases allow GPU in different slots",
        "Consider horizontal vs vertical GPU mounting"
      ],
      alternatives: [
        { label: "Find compatible GPUs", action: "search_gpu_by_length" },
        { label: "Find larger case", action: "search_case" }
      ]
    },

    pcie_slot: {
      title: "Motherboard Has No PCIe x16 Slot for GPU",
      severity: "critical",
      steps: [
        "For gaming: Your motherboard MUST have PCIe x16 slot",
        "Check motherboard specs carefully",
        "This is very rare - almost all boards have it",
        "Replace motherboard if truly missing slot"
      ],
      alternatives: [
        { label: "Find motherboard with PCIe x16 slot", action: "search_motherboard" }
      ]
    },

    pcie_version: {
      title: "PCIe Generation Mismatch",
      severity: "warning",
      steps: [
        "Older PCIe slot will run newer GPU at reduced bandwidth",
        "Performance impact: 5-10% in most workloads",
        "This is normal backward compatibility",
        "Upgrade motherboard if new PCIe critical for you"
      ],
      alternatives: [
        { label: "Find newer motherboard with PCIe 5.0", action: "search_motherboard" }
      ]
    },

    pcie_lanes: {
      title: "Insufficient PCIe Lanes for GPU",
      severity: "warning",
      steps: [
        "GPU will run at x8 instead of x16 (or lower)",
        "Performance impact: typically 3-5%",
        "Completely functional, just slightly limited",
        "Upgrade motherboard for x16 full speed if needed"
      ],
      alternatives: [
        { label: "Find motherboard with full x16 lanes", action: "search_motherboard" }
      ]
    },

    cooler_height: {
      title: "CPU Cooler Exceeds Case Clearance",
      severity: "critical",
      steps: [
        "Choose a shorter cooler or larger case",
        "Measure available cooler height in case",
        "Consider low-profile coolers for small cases",
        "Liquid coolers may have different clearance"
      ],
      alternatives: [
        { label: "Find compatible cooler", action: "search_cooler_by_height" },
        { label: "Find larger case", action: "search_case" }
      ]
    },

    cooler_ram_clearance: {
      title: "RAM Conflicts with CPU Cooler",
      severity: "warning",
      steps: [
        "Use low-profile RAM (check specs for height)",
        "Or use cooler with better RAM clearance",
        "Or reposition RAM slots (usually works)",
        "Liquid coolers often have better RAM clearance"
      ],
      alternatives: [
        { label: "Find low-profile RAM", action: "search_ram_lowprofile" },
        { label: "Find cooler with more clearance", action: "search_cooler" }
      ]
    },

    cooler_tdp: {
      title: "CPU Cooler Cannot Handle CPU TDP",
      severity: "critical",
      steps: [
        "Replace cooler with one rated for your CPU TDP",
        "Check cooler specifications for TDP rating",
        "Add 20-30W safety margin to cooler capacity",
        "High-end CPUs need high-end coolers"
      ],
      alternatives: [
        { label: "Find compatible cooler", action: "search_cooler_by_tdp" },
        { label: "Choose lower TDP CPU", action: "search_cpu_by_tdp" }
      ]
    },

    cooler_socket: {
      title: "CPU Cooler Socket Incompatible",
      severity: "critical",
      steps: [
        "Purchase cooler with bracket for your socket",
        "Common sockets: AM5 (AMD), LGA1700 (Intel 12th-14th gen)",
        "Older sockets: AM4 (AMD), LGA1200 (Intel 11th gen)",
        "Many coolers support multiple sockets with included brackets"
      ],
      alternatives: [
        { label: "Find compatible cooler", action: "search_cooler_by_socket" }
      ]
    },

    psu_wattage: {
      title: "PSU Wattage Insufficient or Too Low Headroom",
      severity: "critical",
      steps: [
        "Upgrade to PSU with higher wattage",
        "Recommended: 30-40% headroom above calculated usage",
        "Example: 800W component usage = 1100W PSU recommended",
        "Check reputable PSU brands: Corsair, EVGA, MSI, Be Quiet"
      ],
      alternatives: [
        { label: "Find compatible PSU", action: "search_psu_by_wattage" },
        { label: "Rebuild with lower power components", action: "optimize_for_power" }
      ]
    },

    psu_quality: {
      title: "Upgrade PSU Efficiency Rating",
      severity: "info",
      steps: [
        "Consider 80+ Gold or Platinum PSU for longevity",
        "Gold: 90% efficiency, lasts 10+ years",
        "Platinum: 92%+ efficiency, less heat and noise",
        "Investment in quality PSU pays off long-term"
      ],
      alternatives: [
        { label: "Find high-efficiency PSU", action: "search_psu_gold" }
      ]
    },

    display_output: {
      title: "No Display Output - CPU Has No Integrated Graphics",
      severity: "critical",
      steps: [
        "You MUST add a dedicated GPU for display output",
        "Your CPU cannot output to monitor without GPU",
        "Add any compatible GPU (gaming or workstation)"
      ],
      alternatives: [
        { label: "Find GPU", action: "search_gpu" },
        { label: "Choose CPU with integrated graphics", action: "search_cpu_integrated" }
      ]
    },

    storage_interface: {
      title: "Storage Interface Not Supported",
      severity: "critical",
      steps: [
        "Replace with compatible storage type",
        "NVMe: Requires M.2 slot (all modern boards have this)",
        "SATA: Requires SATA port (legacy, all boards support)",
        "Choose storage matching your motherboard"
      ],
      alternatives: [
        { label: "Find compatible storage", action: "search_storage" },
        { label: "Find motherboard with NVMe support", action: "search_motherboard" }
      ]
    },

    storage_sata_m2_conflict: {
      title: "M.2 Slot Disabled by SATA Drives",
      severity: "warning",
      steps: [
        "Check motherboard manual for M.2 slot requirements",
        "Some boards disable M.2 slot when SATA drives connected",
        "Solution: Use different M.2 slot or remove SATA drive",
        "Or use only NVMe drives, skip SATA entirely"
      ],
      alternatives: [
        { label: "Use different M.2 slot", action: "check_motherboard_manual" },
        { label: "Replace SATA with NVMe", action: "search_nvme_ssd" }
      ]
    },

    thermal_profile: {
      title: "Thermal Components Mismatched",
      severity: "warning",
      steps: [
        "High-end GPUs + high TDP CPUs = Need good case airflow",
        "Consider better case with more fans",
        "Or upgrade to liquid cooling",
        "Or reduce GPU/CPU wattage"
      ],
      alternatives: [
        { label: "Find case with excellent airflow", action: "search_case_airflow" },
        { label: "Find liquid cooler", action: "search_liquid_cooler" }
      ]
    },

    balance: {
      title: "Build Balance Issue - Potential GPU Bottleneck",
      severity: "warning",
      steps: [
        "Your GPU is significantly more powerful than CPU",
        "In gaming: CPU may bottleneck GPU performance",
        "Consider upgrading CPU to better GPU match",
        "Or reduce GPU tier to balance with CPU",
        "This depends heavily on game resolution and settings"
      ],
      alternatives: [
        { label: "Find compatible CPU", action: "search_cpu_upgrade" },
        { label: "Find balanced GPU", action: "search_gpu_balanced" }
      ]
    }
  };

  return fixes[checkId] || null;
}

/**
 * Get all fixes for a build
 */
export const getBuildFixes = async (compatibilityResult, selectedPartIds = {}) => {
  const fixes = [];
  const { checks } = compatibilityResult;

  for (const check of checks) {
    if (check.status === "fail" || check.status === "warn") {
      const fix = generateFixForCheck(check.id, check.message, selectedPartIds);
      if (fix) {
        fixes.push({
          checkId: check.id,
          checkTitle: check.title,
          checkStatus: check.status,
          message: check.message,
          fix
        });
      }
    }
  }

  // Sort by severity: critical > warning > info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  fixes.sort((a, b) => severityOrder[a.fix.severity] - severityOrder[b.fix.severity]);

  return fixes;
};

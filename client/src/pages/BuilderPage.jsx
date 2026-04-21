import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  checkCompatibility,
  createBuild,
  ensureBuildShare,
  fetchBuilds,
  fetchComponents,
  getSuggestedFixes
} from "../api";
import CaseViewer3D from "../components/CaseViewer3D";
import { PART_TYPES } from "../constants";
import { useCart } from "../context/CartContext";
import { currency } from "../utils/format";
import {
  BUILD_TEMPLATES,
  buildMarkdownSummary,
  buildSelectionFromTemplate,
  decodeBuildShareData,
  encodeBuildShareData
} from "../utils/buildTemplates";
import { estimateFpsByGame, FPS_PRESETS } from "../utils/fpsEstimator";
import { getPartImage } from "../utils/partMedia";

const initialSelection = PART_TYPES.reduce((acc, part) => {
  acc[part.key] = "";
  return acc;
}, {});

const toPartId = (value) => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object") {
    if (value._id) {
      return String(value._id);
    }
    if (value.id) {
      return String(value.id);
    }
  }
  return "";
};

const summarizeCompatibilityRisks = (compatibility) => {
  const checks = Array.isArray(compatibility?.checks) ? compatibility.checks : [];
  const failCount = checks.length
    ? checks.filter((item) => item?.status === "fail").length
    : Number(compatibility?.issues?.length || 0);
  const warnCount = checks.length
    ? checks.filter((item) => item?.status === "warn").length
    : Number(compatibility?.warnings?.length || 0);

  if (failCount > 0) {
    return {
      failCount,
      warnCount,
      level: "high",
      label: `${failCount} critical ${failCount === 1 ? "risk" : "risks"}`
    };
  }

  if (warnCount > 0) {
    return {
      failCount,
      warnCount,
      level: "medium",
      label: `${warnCount} warning${warnCount === 1 ? "" : "s"}`
    };
  }

  return {
    failCount,
    warnCount,
    level: "low",
    label: "No compatibility risks"
  };
};

const RECOMMENDATION_PRIORITY_WEIGHT = {
  high: 3,
  medium: 2,
  low: 1
};

const TARGET_FPS_BY_PRESET = {
  "1080p": 144,
  "1440p": 100,
  "4k": 60
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getAverageFps = (estimate) => {
  if (!estimate?.ready || !Array.isArray(estimate.games) || estimate.games.length === 0) {
    return null;
  }
  return Math.round(
    estimate.games.reduce((sum, game) => sum + toNumber(game?.averageFps, 0), 0) / estimate.games.length
  );
};

export default function BuilderPage() {
  const location = useLocation();
  const { addItem } = useCart();
  const [catalog, setCatalog] = useState({});
  const [selectedIds, setSelectedIds] = useState(initialSelection);
  const [compatibility, setCompatibility] = useState(null);
  const [fixes, setFixes] = useState(null);
  const [showFixesModal, setShowFixesModal] = useState(false);
  const [loadingFixes, setLoadingFixes] = useState(false);
  const [savedBuilds, setSavedBuilds] = useState([]);
  const [buildName, setBuildName] = useState("Budget 1440p Gaming Build");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [importedFromUrl, setImportedFromUrl] = useState(false);
  const [activeSavedBuildId, setActiveSavedBuildId] = useState("");
  const [fpsPreset, setFpsPreset] = useState("1440p");
  const [compareBuildIds, setCompareBuildIds] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      try {
        const componentPromises = PART_TYPES.map((part) =>
          fetchComponents({ type: part.key, sortBy: "price" })
        );
        const [componentSets, builds] = await Promise.all([
          Promise.all(componentPromises),
          fetchBuilds()
        ]);

        const nextCatalog = {};
        PART_TYPES.forEach((part, index) => {
          nextCatalog[part.key] = componentSets[index];
        });

        setCatalog(nextCatalog);
        setSavedBuilds(builds);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load builder data.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    setImportedFromUrl(false);
  }, [location.search]);

  const selectedParts = useMemo(() => {
    const resolved = {};
    for (const part of PART_TYPES) {
      const options = catalog[part.key] || [];
      resolved[part.key] = options.find((item) => item._id === selectedIds[part.key]) || null;
    }
    return resolved;
  }, [catalog, selectedIds]);

  const catalogById = useMemo(() => {
    const byId = {};
    for (const options of Object.values(catalog)) {
      for (const item of options || []) {
        byId[String(item._id)] = item;
      }
    }
    return byId;
  }, [catalog]);

  const resolveBuildPart = (build, partKey) => {
    const raw = build?.selectedParts?.[partKey];
    if (raw && typeof raw === "object" && raw.name) {
      return raw;
    }

    const id = toPartId(raw);
    if (!id) {
      return null;
    }
    return catalogById[id] || null;
  };

  const filteredCatalog = useMemo(() => {
    const output = {};
    for (const part of PART_TYPES) {
      output[part.key] = [...(catalog[part.key] || [])];
    }

    const cpu = selectedParts.cpu;
    const motherboard = selectedParts.motherboard;
    const gpu = selectedParts.gpu;

    if (cpu?.specs?.socket) {
      const cpuSocket = String(cpu.specs.socket).toLowerCase();
      output.motherboard = output.motherboard.filter((item) => {
        if (!item.specs?.socket) return true;
        return String(item.specs.socket).toLowerCase() === cpuSocket;
      });
    }

    if (motherboard?.specs?.ramType) {
      const mbRamType = String(motherboard.specs.ramType).toLowerCase();
      output.ram = output.ram.filter((item) => {
        if (!item.specs?.ramType) return true;
        return String(item.specs.ramType).toLowerCase() === mbRamType;
      });
    }

    if (motherboard?.specs?.formFactor) {
      output.case = output.case.filter((buildCase) => {
        const supported = buildCase.specs?.supportedFormFactors;
        if (Array.isArray(supported) && supported.length > 0) {
          return supported.includes(motherboard.specs.formFactor);
        }
        const caseFactor = buildCase.specs?.formFactor;
        if (typeof caseFactor === "string") {
          return caseFactor.includes(motherboard.specs.formFactor);
        }
        return true; // Show if no metadata
      });
    }

    const powerTarget =
      (cpu?.specs?.tdp || 0) +
      (gpu?.specs?.tdp || 0) +
      (selectedParts.ram ? 10 : 0) +
      (selectedParts.storage ? 8 : 0);
    if (powerTarget > 0) {
      const recommended = Math.ceil((powerTarget * 1.35) / 50) * 50;
      output.psu = output.psu.filter((psu) => (psu.specs?.wattage || 0) >= recommended);
    }

    return output;
  }, [catalog, selectedParts]);

  useEffect(() => {
    if (loading || importedFromUrl) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const raw = params.get("build");
    if (!raw) {
      setImportedFromUrl(true);
      return;
    }

    const parsed = decodeBuildShareData(raw);
    if (!parsed) {
      setImportedFromUrl(true);
      setError("Shared build data is invalid.");
      return;
    }

    const nextSelection = { ...initialSelection };
    for (const [type, id] of Object.entries(parsed.selectedPartIds || {})) {
      if (Object.prototype.hasOwnProperty.call(nextSelection, type)) {
        nextSelection[type] = String(id || "");
      }
    }

    setSelectedIds(nextSelection);
    if (parsed.name) {
      setBuildName(parsed.name);
    }
    setImportedFromUrl(true);
    setSuccess("Shared build loaded from link.");
  }, [importedFromUrl, loading, location.search]);

  useEffect(() => {
    const selectedPartIds = Object.fromEntries(
      Object.entries(selectedIds).filter((entry) => Boolean(entry[1]))
    );

    if (!Object.keys(selectedPartIds).length) {
      setCompatibility(null);
      return;
    }

    let active = true;
    checkCompatibility(selectedPartIds)
      .then((result) => {
        if (active) {
          setCompatibility(result);
          setFixes(null);
        }
      })
      .catch(() => {
        if (active) {
          setCompatibility(null);
          setFixes(null);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedIds]);

  const totalPrice = useMemo(() => {
    return Object.values(selectedParts).reduce((sum, part) => sum + Number(part?.price || 0), 0);
  }, [selectedParts]);

  const selectedCount = useMemo(() => {
    return Object.values(selectedIds).filter(Boolean).length;
  }, [selectedIds]);

  const compatibilityLabel = useMemo(() => {
    if (!compatibility) {
      return "Not checked";
    }
    if (compatibility.status === "ready") {
      return "Compatible";
    }
    if (compatibility.status === "incompatible") {
      return "Incompatible";
    }
    return "Incomplete";
  }, [compatibility]);

  const fpsEstimate = useMemo(() => {
    return estimateFpsByGame({
      cpu: selectedParts.cpu,
      gpu: selectedParts.gpu,
      presetKey: fpsPreset
    });
  }, [fpsPreset, selectedParts.cpu, selectedParts.gpu]);

  const handleGetFixes = async () => {
    if (!compatibility || loadingFixes) return;
    
    setLoadingFixes(true);
    try {
      const selectedPartIds = Object.fromEntries(
        Object.entries(selectedIds).filter((entry) => Boolean(entry[1]))
      );
      const result = await getSuggestedFixes(selectedPartIds);
      setFixes(result);
      setShowFixesModal(true);
    } catch (error) {
      console.error("Failed to fetch fixes:", error);
    } finally {
      setLoadingFixes(false);
    }
  };

  const handleApplyFix = (alternative) => {
    if (!alternative?.type || !alternative?.id) {
      return;
    }

    setSelectedIds((current) => ({
      ...current,
      [alternative.type]: alternative.id
    }));
    setSelectedTemplate("");
    setError("");
    setSuccess(`Applied fix: ${alternative.name}`);
    setShowFixesModal(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const smartRecommendations = useMemo(() => {
    const recommendations = [];
    const selectedCpu = selectedParts.cpu;
    const selectedGpu = selectedParts.gpu;
    const selectedMotherboard = selectedParts.motherboard;
    const selectedRam = selectedParts.ram;
    const selectedCase = selectedParts.case;
    const selectedPsu = selectedParts.psu;

    const checks = Array.isArray(compatibility?.checks) ? compatibility.checks : [];
    const checkMap = checks.reduce((acc, check) => {
      if (check?.id) {
        acc[check.id] = check;
      }
      return acc;
    }, {});

    const createRecommendation = ({
      id,
      partType,
      candidate,
      currentPart,
      title,
      reason,
      impact,
      priority = "medium",
      score = 0
    }) => {
      if (!candidate?._id) {
        return null;
      }

      return {
        id,
        partType,
        partId: String(candidate._id),
        partName: candidate.name,
        title,
        reason,
        impact,
        priority,
        score,
        priceDelta: toNumber(candidate.price, 0) - toNumber(currentPart?.price, 0)
      };
    };

    const pushRecommendation = (item) => {
      if (item) {
        recommendations.push(item);
      }
    };

    const isCpuCompatibleWithMotherboard = (cpu, motherboard) => {
      if (!cpu || !motherboard) {
        return true;
      }

      if (cpu.specs?.socket && motherboard.specs?.socket && cpu.specs.socket !== motherboard.specs.socket) {
        return false;
      }

      const supportedGenerations = Array.isArray(motherboard.specs?.biosSupportedGenerations)
        ? motherboard.specs.biosSupportedGenerations
        : [];
      if (supportedGenerations.length > 0 && cpu.specs?.generation) {
        return supportedGenerations.includes(cpu.specs.generation);
      }

      return true;
    };

    const isMotherboardCompatibleWithCase = (motherboard, buildCase) => {
      if (!motherboard || !buildCase) {
        return true;
      }
      const supportedFormFactors = Array.isArray(buildCase.specs?.supportedFormFactors)
        ? buildCase.specs.supportedFormFactors
        : [];
      if (supportedFormFactors.length === 0 || !motherboard.specs?.formFactor) {
        return true;
      }
      return supportedFormFactors.includes(motherboard.specs.formFactor);
    };

    const isRamCompatibleWithMotherboard = (ram, motherboard) => {
      if (!ram || !motherboard) {
        return true;
      }
      if (!ram.specs?.ramType || !motherboard.specs?.ramType) {
        return true;
      }
      return ram.specs.ramType === motherboard.specs.ramType;
    };

    const isGpuCompatibleWithCase = (gpu, buildCase) => {
      if (!gpu || !buildCase) {
        return true;
      }
      const maxLength = toNumber(buildCase.specs?.gpuMaxLengthMm, 0);
      const gpuLength = toNumber(gpu.specs?.lengthMm, 0);
      if (!maxLength || !gpuLength) {
        return true;
      }
      return gpuLength <= maxLength;
    };

    const psuCheck = checkMap.psu_wattage;
    const requiredPsuWattage = toNumber(compatibility?.recommendedPsuWattage, 0);
    const currentPsuWattage = toNumber(selectedPsu?.specs?.wattage, 0);
    if (
      requiredPsuWattage > 0 &&
      (!selectedPsu ||
        currentPsuWattage < requiredPsuWattage ||
        psuCheck?.status === "fail" ||
        psuCheck?.status === "warn")
    ) {
      const psuUpgrade = [...(catalog.psu || [])]
        .filter((item) => {
          const wattage = toNumber(item.specs?.wattage, 0);
          return wattage >= requiredPsuWattage;
        })
        .sort(
          (a, b) =>
            toNumber(a.price, 0) - toNumber(b.price, 0) ||
            toNumber(a.specs?.wattage, 0) - toNumber(b.specs?.wattage, 0)
        )[0];

      if (psuUpgrade && String(psuUpgrade._id) !== String(selectedPsu?._id || "")) {
        const addedHeadroom =
          toNumber(psuUpgrade.specs?.wattage, 0) - toNumber(compatibility?.totalEstimatedWattage, 0);
        pushRecommendation(
          createRecommendation({
            id: "rec-psu-headroom",
            partType: "psu",
            candidate: psuUpgrade,
            currentPart: selectedPsu,
            title: "Increase PSU Headroom",
            reason: "Current power supply is near the recommended limit for this build.",
            impact: `Upgrading to ${psuUpgrade.name} gives about ${Math.max(0, addedHeadroom)}W spare capacity.`,
            priority: psuCheck?.status === "fail" ? "high" : "medium",
            score: 900 - Math.max(0, toNumber(psuUpgrade.price, 0) - toNumber(selectedPsu?.price, 0))
          })
        );
      }
    }

    const socketCheck = checkMap.cpu_motherboard_socket;
    if (socketCheck?.status === "fail" && selectedCpu) {
      const motherboardFix = [...(catalog.motherboard || [])]
        .filter((item) => {
          const socketOk =
            !selectedCpu.specs?.socket || !item.specs?.socket || selectedCpu.specs.socket === item.specs.socket;
          const ramOk = isRamCompatibleWithMotherboard(selectedRam, item);
          const caseOk = isMotherboardCompatibleWithCase(item, selectedCase);
          return socketOk && ramOk && caseOk;
        })
        .sort((a, b) => toNumber(a.price, 0) - toNumber(b.price, 0))[0];

      if (motherboardFix && String(motherboardFix._id) !== String(selectedMotherboard?._id || "")) {
        pushRecommendation(
          createRecommendation({
            id: "rec-socket-fix-motherboard",
            partType: "motherboard",
            candidate: motherboardFix,
            currentPart: selectedMotherboard,
            title: "Fix CPU and Motherboard Socket Mismatch",
            reason: "Your CPU and motherboard sockets do not match, blocking the build.",
            impact: `Switching to ${motherboardFix.name} restores core platform compatibility.`,
            priority: "high",
            score: 1000 - toNumber(motherboardFix.price, 0)
          })
        );
      }
    }

    const ramTypeCheck = checkMap.ram_type;
    if (ramTypeCheck?.status === "fail" && selectedMotherboard) {
      const ramFix = [...(catalog.ram || [])]
        .filter((item) => isRamCompatibleWithMotherboard(item, selectedMotherboard))
        .sort((a, b) => toNumber(a.price, 0) - toNumber(b.price, 0))[0];

      if (ramFix && String(ramFix._id) !== String(selectedRam?._id || "")) {
        pushRecommendation(
          createRecommendation({
            id: "rec-ram-type-fix",
            partType: "ram",
            candidate: ramFix,
            currentPart: selectedRam,
            title: "Match RAM Generation",
            reason: "Current RAM type is incompatible with the selected motherboard.",
            impact: `${ramFix.name} matches ${selectedMotherboard.specs?.ramType || "required"} memory support.`,
            priority: "high",
            score: 920 - toNumber(ramFix.price, 0)
          })
        );
      }
    }

    const caseClearanceFail = checkMap.gpu_clearance?.status === "fail";
    const caseFormFactorFail = checkMap.case_form_factor?.status === "fail";
    if ((caseClearanceFail || caseFormFactorFail) && selectedCase) {
      const caseFix = [...(catalog.case || [])]
        .filter((item) => {
          const gpuOk = isGpuCompatibleWithCase(selectedGpu, item);
          const motherboardOk = isMotherboardCompatibleWithCase(selectedMotherboard, item);
          return gpuOk && motherboardOk;
        })
        .sort((a, b) => toNumber(a.price, 0) - toNumber(b.price, 0))[0];

      if (caseFix && String(caseFix._id) !== String(selectedCase._id || "")) {
        pushRecommendation(
          createRecommendation({
            id: "rec-case-fit-fix",
            partType: "case",
            candidate: caseFix,
            currentPart: selectedCase,
            title: "Resolve Physical Fit Bottlenecks",
            reason: "Current case dimensions are constraining motherboard or GPU fit.",
            impact: `${caseFix.name} provides better clearance for your selected components.`,
            priority: "high",
            score: 880 - toNumber(caseFix.price, 0)
          })
        );
      }
    }

    if (selectedCpu && selectedGpu) {
      const baselineEstimate = estimateFpsByGame({
        cpu: selectedCpu,
        gpu: selectedGpu,
        presetKey: fpsPreset
      });
      const baselineAvgFps = getAverageFps(baselineEstimate);
      const targetFps = TARGET_FPS_BY_PRESET[fpsPreset] || 90;
      const fpsDeficit = Math.max(0, targetFps - toNumber(baselineAvgFps, 0));

      if (baselineEstimate.ready && Number.isFinite(baselineAvgFps)) {
        let bestGpuUpgrade = null;
        for (const candidate of catalog.gpu || []) {
          if (!candidate?._id || String(candidate._id) === String(selectedGpu._id)) {
            continue;
          }
          if (!isGpuCompatibleWithCase(candidate, selectedCase)) {
            continue;
          }

          const candidateEstimate = estimateFpsByGame({
            cpu: selectedCpu,
            gpu: candidate,
            presetKey: fpsPreset
          });
          const candidateAvgFps = getAverageFps(candidateEstimate);
          if (!candidateEstimate.ready || !Number.isFinite(candidateAvgFps)) {
            continue;
          }

          const gain = candidateAvgFps - baselineAvgFps;
          if (gain < 5) {
            continue;
          }

          const priceDelta = toNumber(candidate.price, 0) - toNumber(selectedGpu.price, 0);
          const valueScore = priceDelta <= 0 ? gain * 12 : (gain / priceDelta) * 100;
          const weightedScore = valueScore + gain + Math.min(fpsDeficit, gain) * 0.7;

          const recommendation = createRecommendation({
            id: `rec-gpu-upgrade-${candidate._id}`,
            partType: "gpu",
            candidate,
            currentPart: selectedGpu,
            title: "Best Value GPU Upgrade",
            reason:
              fpsDeficit > 0
                ? "Current FPS is below target for this preset, and GPU upgrade gives the strongest gain per dollar."
                : "GPU swap gives the best FPS gain per dollar among compatible options.",
            impact: `Estimated +${gain} avg FPS at ${fpsPreset.toUpperCase()} (${baselineAvgFps} -> ${candidateAvgFps}).`,
            priority: fpsDeficit > 0 ? "high" : "medium",
            score: weightedScore
          });

          if (!bestGpuUpgrade || recommendation.score > bestGpuUpgrade.score) {
            bestGpuUpgrade = recommendation;
          }
        }

        if (bestGpuUpgrade) {
          pushRecommendation(bestGpuUpgrade);
        }

        let bestCpuUpgrade = null;
        for (const candidate of catalog.cpu || []) {
          if (!candidate?._id || String(candidate._id) === String(selectedCpu._id)) {
            continue;
          }
          if (!isCpuCompatibleWithMotherboard(candidate, selectedMotherboard)) {
            continue;
          }

          const candidateEstimate = estimateFpsByGame({
            cpu: candidate,
            gpu: selectedGpu,
            presetKey: fpsPreset
          });
          const candidateAvgFps = getAverageFps(candidateEstimate);
          if (!candidateEstimate.ready || !Number.isFinite(candidateAvgFps)) {
            continue;
          }

          const gain = candidateAvgFps - baselineAvgFps;
          if (gain < 4) {
            continue;
          }

          const priceDelta = toNumber(candidate.price, 0) - toNumber(selectedCpu.price, 0);
          const valueScore = priceDelta <= 0 ? gain * 10 : (gain / priceDelta) * 100;
          const weightedScore = valueScore + gain * 0.75 + Math.min(fpsDeficit, gain) * 0.4;

          const recommendation = createRecommendation({
            id: `rec-cpu-upgrade-${candidate._id}`,
            partType: "cpu",
            candidate,
            currentPart: selectedCpu,
            title: "CPU Upgrade for Better 1% Lows",
            reason:
              fpsDeficit > 0
                ? "CPU uplift improves frame-time stability while raising average FPS."
                : "This CPU gives better frame consistency for the spend.",
            impact: `Estimated +${gain} avg FPS at ${fpsPreset.toUpperCase()} (${baselineAvgFps} -> ${candidateAvgFps}).`,
            priority: fpsDeficit > 20 ? "medium" : "low",
            score: weightedScore
          });

          if (!bestCpuUpgrade || recommendation.score > bestCpuUpgrade.score) {
            bestCpuUpgrade = recommendation;
          }
        }

        if (bestCpuUpgrade) {
          pushRecommendation(bestCpuUpgrade);
        }
      }
    }

    if (!selectedParts.storage) {
      const storageAddOn = [...(catalog.storage || [])]
        .filter((item) => String(item.specs?.interface || "").toLowerCase() === "nvme")
        .sort((a, b) => toNumber(a.price, 0) - toNumber(b.price, 0))[0];
      if (storageAddOn) {
        pushRecommendation(
          createRecommendation({
            id: "rec-add-storage",
            partType: "storage",
            candidate: storageAddOn,
            currentPart: null,
            title: "Add NVMe Storage",
            reason: "No storage is selected, which is a hard bottleneck for OS and game load times.",
            impact: `Adding ${storageAddOn.name} removes storage bottlenecks for system responsiveness.`,
            priority: "high",
            score: 850 - toNumber(storageAddOn.price, 0)
          })
        );
      }
    }

    const bestByPartType = new Map();
    for (const item of recommendations) {
      const existing = bestByPartType.get(item.partType);
      if (!existing || item.score > existing.score) {
        bestByPartType.set(item.partType, item);
      }
    }

    return [...bestByPartType.values()]
      .sort((a, b) => {
        const priorityDiff =
          (RECOMMENDATION_PRIORITY_WEIGHT[b.priority] || 0) - (RECOMMENDATION_PRIORITY_WEIGHT[a.priority] || 0);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return b.score - a.score;
      })
      .slice(0, 4);
  }, [catalog, compatibility, fpsPreset, selectedParts]);

  const compareBuilds = useMemo(() => {
    return compareBuildIds
      .map((id) => savedBuilds.find((item) => String(item._id) === String(id)))
      .filter(Boolean);
  }, [compareBuildIds, savedBuilds]);

  const compareRows = useMemo(() => {
    return compareBuilds.map((build) => {
      const cpu = resolveBuildPart(build, "cpu");
      const gpu = resolveBuildPart(build, "gpu");
      const fps = estimateFpsByGame({
        cpu,
        gpu,
        presetKey: fpsPreset
      });

      const avgFps = fps.ready
        ? Math.round(
            fps.games.reduce((sum, game) => sum + Number(game?.averageFps || 0), 0) / Math.max(1, fps.games.length)
          )
        : null;
      const avgLow = fps.ready
        ? Math.round(
            fps.games.reduce((sum, game) => sum + Number(game?.onePercentLow || 0), 0) /
              Math.max(1, fps.games.length)
          )
        : null;
      const risks = summarizeCompatibilityRisks(build?.compatibility);

      return {
        id: String(build._id),
        name: String(build.name || "Saved Build"),
        price: Number(build.totalPrice || 0),
        wattage: Number(build?.compatibility?.totalEstimatedWattage || 0),
        score: Number(build?.compatibility?.score || 0),
        status: String(build?.compatibility?.status || "incomplete"),
        risks,
        fpsReady: fps.ready,
        avgFps,
        avgLow,
        fpsNotes: fps.notes || [],
        fpsCpuLabel: fps.cpuLabel || cpu?.name || "CPU unavailable",
        fpsGpuLabel: fps.gpuLabel || gpu?.name || "GPU unavailable",
        build
      };
    });
  }, [catalogById, compareBuilds, fpsPreset]);

  const compareDelta = useMemo(() => {
    if (compareRows.length !== 2) {
      return null;
    }

    const [left, right] = compareRows;
    return {
      price: left.price - right.price,
      wattage: left.wattage - right.wattage,
      fps: Number.isFinite(left.avgFps) && Number.isFinite(right.avgFps) ? left.avgFps - right.avgFps : null
    };
  }, [compareRows]);

  useEffect(() => {
    const existingIds = new Set(savedBuilds.map((item) => String(item._id)));
    setCompareBuildIds((current) => current.filter((id) => existingIds.has(String(id))).slice(0, 2));
  }, [savedBuilds]);

  const onChangePart = (type, id) => {
    setError("");
    setSuccess("");
    setSelectedTemplate("");
    setSelectedIds((current) => ({ ...current, [type]: id }));
  };

  const onRemovePart = (type) => {
    setError("");
    setSuccess("");
    setSelectedTemplate("");
    setSelectedIds((current) => ({ ...current, [type]: "" }));
  };

  const onClear = () => {
    setSelectedIds({ ...initialSelection });
    setCompatibility(null);
    setError("");
    setSuccess("");
    setSelectedTemplate("");
    setActiveSavedBuildId("");
  };

  const onSaveBuild = async () => {
    const selectedPartIds = Object.fromEntries(
      Object.entries(selectedIds).filter((entry) => Boolean(entry[1]))
    );

    if (!Object.keys(selectedPartIds).length) {
      setError("Pick at least one part before saving.");
      setSuccess("");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await createBuild({
        name: buildName.trim() || "Untitled Build",
        selectedPartIds
      });
      setSavedBuilds((current) => [created, ...current].slice(0, 30));
      setSuccess("Build saved successfully.");
      setActiveSavedBuildId(String(created._id || ""));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save build.");
    } finally {
      setSaving(false);
    }
  };

  const onAddSelectedToCart = async () => {
    const ids = Object.values(selectedIds).filter(Boolean);
    if (!ids.length) {
      setError("Select at least one part first.");
      setSuccess("");
      return;
    }

    setError("");
    setSuccess("");
    try {
      for (const id of ids) {
        await addItem(id, 1);
      }
      setSuccess("Selected parts added to cart.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add selected parts to cart.");
    }
  };

  const onApplyTemplate = (templateKey) => {
    const result = buildSelectionFromTemplate(catalog, templateKey);
    if (!result) {
      setError("Template not available.");
      setSuccess("");
      return;
    }

    setSelectedIds(result.selectedPartIds);
    setBuildName(result.template.label);
    setSelectedTemplate(result.template.key);
    setError("");
    setSuccess(`Template "${result.template.label}" applied.`);
  };

  const onCopyShareLink = async () => {
    const selectedPartIds = Object.fromEntries(
      Object.entries(selectedIds).filter((entry) => Boolean(entry[1]))
    );

    if (!Object.keys(selectedPartIds).length) {
      setError("Select at least one part before generating a share link.");
      setSuccess("");
      return;
    }

    const params = new URLSearchParams(location.search);
    params.set("build", encodeBuildShareData({ name: buildName, selectedPartIds }));
    const shareUrl = `${window.location.origin}/builder?${params.toString()}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setError("");
      setSuccess("Share link copied to clipboard.");
    } catch (err) {
      setError("Clipboard access failed. Please copy the URL manually from browser.");
      setSuccess("");
    }
  };

  const onExportMarkdown = async () => {
    const markdown = buildMarkdownSummary({
      name: buildName,
      selectedParts,
      formatPrice: (value) => currency.format(value)
    });

    try {
      await navigator.clipboard.writeText(markdown);
      setError("");
      setSuccess("Build markdown copied to clipboard.");
    } catch (err) {
      setError("Clipboard access failed while exporting markdown.");
      setSuccess("");
    }
  };

  const onCopyPublicBuildLink = async (build) => {
    if (!build?._id) {
      setError("Saved build id is missing.");
      setSuccess("");
      return;
    }

    setError("");
    setSuccess("");
    try {
      let shareId = build.shareId;
      if (!shareId || build.isPublic === false) {
        const result = await ensureBuildShare(build._id, true);
        shareId = result.shareId;
        setSavedBuilds((current) =>
          current.map((item) =>
            String(item._id) === String(build._id)
              ? { ...item, shareId: result.shareId, isPublic: result.isPublic }
              : item
          )
        );
      }

      const shareUrl = `${window.location.origin}/build-share/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      setSuccess("Public share link copied.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create public share link.");
      setSuccess("");
    }
  };

  const getOptionsForPart = (partKey) => {
    const options = [...(filteredCatalog[partKey] || [])];
    const selected = selectedParts[partKey];
    if (selected && !options.some((item) => item._id === selected._id)) {
      options.unshift(selected);
    }
    return options;
  };

  const onLoadSavedBuild = (build) => {
    const nextSelection = { ...initialSelection };
    const selectedPartsMap = build?.selectedParts || {};

    for (const partType of PART_TYPES) {
      const rawValue = selectedPartsMap[partType.key];
      nextSelection[partType.key] = toPartId(rawValue);
    }

    const selectedCountInBuild = Object.values(nextSelection).filter(Boolean).length;
    if (!selectedCountInBuild) {
      setError("This saved build has no selectable parts.");
      setSuccess("");
      return;
    }

    setSelectedIds(nextSelection);
    setBuildName(String(build?.name || "Loaded Build"));
    setSelectedTemplate("");
    setActiveSavedBuildId(String(build?._id || ""));
    setError("");
    setSuccess(`Loaded saved build: ${build?.name || "Build"}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onToggleCompareBuild = (buildId) => {
    const normalized = String(buildId || "");
    if (!normalized) {
      return;
    }

    setCompareBuildIds((current) => {
      if (current.includes(normalized)) {
        return current.filter((id) => id !== normalized);
      }
      if (current.length >= 2) {
        return [current[1], normalized];
      }
      return [...current, normalized];
    });
  };

  const onApplyRecommendation = (recommendation) => {
    if (!recommendation?.partType || !recommendation?.partId) {
      return;
    }

    setSelectedIds((current) => ({
      ...current,
      [recommendation.partType]: recommendation.partId
    }));
    setSelectedTemplate("");
    setError("");
    setSuccess(`Applied recommendation: ${recommendation.partName}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatPriceDelta = (value) => {
    if (!Number.isFinite(value) || value === 0) {
      return "No price change";
    }
    return `${value > 0 ? "+" : "-"}${currency.format(Math.abs(value))}`;
  };

  if (loading) {
    return <p>Loading builder...</p>;
  }

  return (
    <div className="builder-wrap">
      {error && <p className="error-banner">{error}</p>}
      {success && <p className="success-banner">{success}</p>}

      <div className="buildcores-layout">
        <section className="panel dark-panel studio-center">
          <div className="studio-header">
            <input
              type="text"
              value={buildName}
              onChange={(event) => setBuildName(event.target.value)}
              className="build-name-input"
            />
            <p className="studio-meta">
              Anonymous | {new Date().toLocaleDateString("en-US")} | {selectedCount} parts selected
            </p>
          </div>

          <div className="template-strip">
            <span>Quick Templates</span>
            {BUILD_TEMPLATES.map((template) => (
              <button
                type="button"
                key={template.key}
                className={selectedTemplate === template.key ? "template-chip active" : "template-chip"}
                onClick={() => onApplyTemplate(template.key)}
              >
                {template.label}
              </button>
            ))}
          </div>

          <div className="studio-metrics">
            <div className="metric-chip">
              <span>{currency.format(totalPrice)}</span>
              <p>Total Price</p>
            </div>
            <div className="metric-chip">
              <span>{compatibilityLabel}</span>
              <p>Compatibility</p>
            </div>
            <div className="metric-chip">
              <span>{compatibility?.totalEstimatedWattage || 0}W</span>
              <p>Power Draw</p>
            </div>
            <div className="metric-chip">
              <span>{compatibility?.score || 0}/100</span>
              <p>Build Score</p>
            </div>
          </div>

          <div className="studio-actions">
            <button type="button" onClick={onAddSelectedToCart}>
              Add to Cart
            </button>
            <button type="button" onClick={onSaveBuild} disabled={saving}>
              {saving ? "Saving..." : "Save Build"}
            </button>
            <button type="button" className="ghost-link" onClick={onCopyShareLink}>
              Copy Share Link
            </button>
            <button type="button" className="ghost-link" onClick={onExportMarkdown}>
              Export Markdown
            </button>
            <button type="button" className="ghost-link" onClick={onClear}>
              Clear Build
            </button>
          </div>

          <CaseViewer3D
            casePart={selectedParts.case}
            gpuPart={selectedParts.gpu}
            motherboardPart={selectedParts.motherboard}
            cpuPart={selectedParts.cpu}
            ramPart={selectedParts.ram}
            psuPart={selectedParts.psu}
            coolerPart={selectedParts.cpu_cooler || selectedParts.cpuCooler}
          />
        </section>

        <aside className="panel dark-panel studio-right">
          <div className="studio-right-head">
            <h2>Parts List</h2>
          </div>
          <div className="part-slots">
            {PART_TYPES.map((part) => {
              const selected = selectedParts[part.key];
              const options = getOptionsForPart(part.key);

              return (
                <article className="part-slot" key={part.key}>
                  <div className="part-slot-head">
                    <h3>{part.label}</h3>
                    {selected && (
                      <button type="button" className="slot-remove" onClick={() => onRemovePart(part.key)}>
                        x
                      </button>
                    )}
                  </div>

                  {selected ? (
                    <div className="part-selected">
                      <img src={getPartImage(selected)} alt={selected.name} loading="lazy" />
                      <div>
                        <p>{selected.name}</p>
                        <strong>{currency.format(selected.price || 0)}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="part-empty">No part selected</p>
                  )}

                  <select
                    value={selectedIds[part.key]}
                    onChange={(event) => onChangePart(part.key, event.target.value)}
                  >
                    <option value="">+ Add {part.label}</option>
                    {options.map((option) => (
                      <option key={option._id} value={option._id}>
                        {option.name} ({currency.format(option.price)})
                      </option>
                    ))}
                  </select>
                </article>
              );
            })}
          </div>
        </aside>
      </div>

      <section className="panel dark-panel">
        <div className="section-head">
          <h2>Compatibility Checks</h2>
          {compatibility && compatibility.checks?.some((c) => c.status === "fail" || c.status === "warn") && (
            <button
              type="button"
              onClick={handleGetFixes}
              disabled={loadingFixes}
              className="btn-fix-suggestions"
            >
              {loadingFixes ? "Loading..." : "Get Fixes 🔧"}
            </button>
          )}
        </div>
        {!compatibility && <p className="meta-line">Select parts to run compatibility validation.</p>}
        {compatibility && (
          <>
            <p className={compatibility.isCompatible ? "ok-pill" : "bad-pill"}>{compatibilityLabel}</p>
            <p className="meta-line">
              Suggested PSU: {compatibility.recommendedPsuWattage || 0}W
            </p>

            {compatibility.checks?.length > 0 && (
              <div className="compat-checks">
                {compatibility.checks
                  .filter((check) => check.status !== "pending")
                  .map((check) => (
                    <article className={`compat-check ${check.status}`} key={check.id}>
                      <div>
                        <h4>{check.title}</h4>
                        <p>{check.message}</p>
                      </div>
                      <span>{check.status.toUpperCase()}</span>
                    </article>
                  ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel dark-panel">
        <div className="section-head">
          <h2>Smart Recommendations</h2>
          <p className="meta-line">Best value upgrades based on your current bottlenecks.</p>
        </div>

        {smartRecommendations.length === 0 && (
          <p className="meta-line">
            No strong upgrade bottleneck detected yet. Add more parts or lower compatibility risks to see suggestions.
          </p>
        )}

        {smartRecommendations.length > 0 && (
          <div className="recommend-list">
            {smartRecommendations.map((item) => (
              <article key={item.id} className={`recommend-card ${item.priority}`}>
                <div className="recommend-head">
                  <h3>{item.title}</h3>
                  <span className={`recommend-priority ${item.priority}`}>{item.priority}</span>
                </div>
                <p>{item.reason}</p>
                <p className="meta-line">{item.impact}</p>
                <p className="meta-line">
                  Suggested part: <strong>{item.partName}</strong> | Price delta:{" "}
                  <strong>{formatPriceDelta(item.priceDelta)}</strong>
                </p>
                <div className="recommend-actions">
                  <button type="button" onClick={() => onApplyRecommendation(item)}>
                    Apply Upgrade
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel dark-panel">
        <div className="fps-toolbar">
          <h2>FPS Estimator Per Game</h2>
          <label>
            Resolution
            <select value={fpsPreset} onChange={(event) => setFpsPreset(event.target.value)}>
              {FPS_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!fpsEstimate.ready && (
          <p className="meta-line">
            {fpsEstimate.notes?.[0] || "Select both CPU and GPU to view estimated FPS."}
          </p>
        )}

        {fpsEstimate.ready && (
          <>
            <div className="fps-summary">
              <span className="fps-tier-chip">{fpsEstimate.cpuLabel}</span>
              <span className="fps-tier-chip">{fpsEstimate.gpuLabel}</span>
              <span className="fps-tier-chip">Source: Benchmarked</span>
            </div>

            <div className="fps-list">
              {fpsEstimate.games.map((game) => (
                <article className="fps-row" key={game.id}>
                  <div>
                    <h4>{game.title}</h4>
                    <p>{game.quality}</p>
                  </div>
                  <p className="fps-value">
                    {game.averageFps} FPS <small>avg</small>
                  </p>
                  <span className={`fps-pill ${game.className}`}>{game.label}</span>
                </article>
              ))}
            </div>

            {fpsEstimate.notes?.length > 0 && (
              <ul className="plain-list">
                {fpsEstimate.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="panel dark-panel">
        <div className="section-head">
          <h2>Build Compare</h2>
          <p className="meta-line">Select any two saved builds for side-by-side comparison.</p>
        </div>
        {compareRows.length < 2 && (
          <p className="meta-line">
            Choose {2 - compareRows.length} more build{2 - compareRows.length === 1 ? "" : "s"} from Saved Builds.
          </p>
        )}

        {compareRows.length > 0 && (
          <div className="compare-grid">
            {compareRows.map((item) => (
              <article key={item.id} className="compare-card">
                <h3>{item.name}</h3>
                <p className="meta-line">
                  {item.fpsCpuLabel} + {item.fpsGpuLabel}
                </p>

                <div className="compare-kpis">
                  <p>
                    <span>Price</span>
                    <strong>{currency.format(item.price)}</strong>
                  </p>
                  <p>
                    <span>Estimated Wattage</span>
                    <strong>{item.wattage}W</strong>
                  </p>
                  <p>
                    <span>Average FPS ({fpsPreset.toUpperCase()})</span>
                    <strong>{item.fpsReady ? `${item.avgFps} FPS` : "-"}</strong>
                  </p>
                  <p>
                    <span>1% Low ({fpsPreset.toUpperCase()})</span>
                    <strong>{item.fpsReady ? `${item.avgLow} FPS` : "-"}</strong>
                  </p>
                  <p>
                    <span>Compatibility Score</span>
                    <strong>{item.score}/100</strong>
                  </p>
                  <p>
                    <span>Compatibility Risks</span>
                    <strong
                      className={
                        item.risks.level === "high"
                          ? "bad-text"
                          : item.risks.level === "medium"
                            ? "warn-text"
                            : "ok-text"
                      }
                    >
                      {item.risks.label}
                    </strong>
                  </p>
                </div>

                {!item.fpsReady && item.fpsNotes.length > 0 && (
                  <p className="meta-line">{item.fpsNotes[0]}</p>
                )}
              </article>
            ))}
          </div>
        )}

        {compareDelta && (
          <div className="compare-delta">
            <p>
              Price gap:{" "}
              <strong>{compareDelta.price === 0 ? "Same price" : currency.format(Math.abs(compareDelta.price))}</strong>{" "}
              ({compareDelta.price <= 0 ? compareRows[0].name : compareRows[1].name} is cheaper)
            </p>
            <p>
              Power gap: <strong>{Math.abs(compareDelta.wattage)}W</strong> (
              {compareDelta.wattage <= 0 ? compareRows[0].name : compareRows[1].name} draws less power)
            </p>
            {compareDelta.fps !== null && (
              <p>
                FPS gap ({fpsPreset.toUpperCase()}): <strong>{Math.abs(compareDelta.fps)} FPS</strong> (
                {compareDelta.fps >= 0 ? compareRows[0].name : compareRows[1].name} is faster)
              </p>
            )}
          </div>
        )}
      </section>

      <section className="panel dark-panel">
        <h2>Saved Builds</h2>
        {savedBuilds.length === 0 && <p>No builds saved yet.</p>}
        <div className="saved-list">
          {savedBuilds.map((build) => (
            <article
              key={build._id}
              className={activeSavedBuildId === String(build._id) ? "saved-item active" : "saved-item"}
            >
              <div>
                <h3>
                  <button type="button" className="saved-load-link" onClick={() => onLoadSavedBuild(build)}>
                    {build.name}
                  </button>
                </h3>
                <p>{currency.format(build.totalPrice || 0)}</p>
                {build.shareId && <small className="meta-line">Share ID: {build.shareId}</small>}
              </div>
              <div className="saved-item-actions">
                <span className={build.compatibility?.isCompatible ? "ok-pill" : "bad-pill"}>
                  {build.compatibility?.isCompatible ? "Compatible" : "Needs review"}
                </span>
                <label className="saved-compare-toggle">
                  <input
                    type="checkbox"
                    checked={compareBuildIds.includes(String(build._id))}
                    onChange={() => onToggleCompareBuild(build._id)}
                  />
                  Compare
                </label>
                <button type="button" className="ghost-link" onClick={() => onLoadSavedBuild(build)}>
                  Load Build
                </button>
                <button type="button" className="ghost-link" onClick={() => onCopyPublicBuildLink(build)}>
                  Copy Public Link
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {showFixesModal && fixes && (
        <div className="modal-overlay" onClick={() => setShowFixesModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Smart Fix Suggestions</h2>
              <button type="button" className="modal-close" onClick={() => setShowFixesModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              {fixes.failCount === 0 && fixes.warningCount === 0 ? (
                <p className="meta-line">No critical issues to fix. Your build is ready!</p>
              ) : (
                <>
                  <p className="meta-line">
                    Found {fixes.failCount} critical {fixes.failCount === 1 ? "issue" : "issues"} and {fixes.warningCount}{" "}
                    {fixes.warningCount === 1 ? "warning" : "warnings"}
                  </p>

                  {fixes.fixes?.length > 0 && (
                    <div className="fixes-list">
                      {fixes.fixes.map((fix, idx) => (
                        <article key={idx} className={`fix-card ${fix.fix.severity}`}>
                          <div>
                            <h4>{fix.fix.title}</h4>
                            <p className="meta-line">{fix.message}</p>
                            <div className="fix-steps">
                              <strong>How to fix:</strong>
                              <ol>
                                {fix.fix.steps.map((step, stepIdx) => (
                                  <li key={stepIdx}>{step}</li>
                                ))}
                              </ol>
                            </div>
                            {fix.fix.alternatives?.length > 0 && (
                              <div className="fix-alternatives">
                                <strong>Alternatives:</strong>
                                <ul>
                                  {fix.fix.alternatives.map((alt, altIdx) => (
                                    <li key={altIdx}>{alt.label}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <span className={`severity-badge ${fix.fix.severity}`}>{fix.fix.severity.toUpperCase()}</span>
                        </article>
                      ))}
                    </div>
                  )}

                  {fixes.suggestedAlternatives?.length > 0 && (
                    <div className="alternatives-list">
                      <h3>Suggested Component Replacements</h3>
                      {fixes.suggestedAlternatives.map((alt, idx) => (
                        <article key={idx} className="alternative-card">
                          <h4>{alt.checkTitle}</h4>
                          <p className="meta-line">{alt.failingPart}</p>
                          {alt.alternatives?.length > 0 ? (
                            <div className="alternatives-items">
                              {alt.alternatives.map((item, itemIdx) => (
                                <div key={itemIdx} className="alt-item">
                                  <div className="alt-item-info">
                                    <span>{item.name}</span>
                                    <span className="meta-line">{currency.format(item.price)} • {item.reason}</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="alt-item-button"
                                    onClick={() => handleApplyFix(item)}
                                  >
                                    Apply Fix
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="meta-line">No compatible alternatives found.</p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setShowFixesModal(false)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

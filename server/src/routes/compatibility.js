import express from "express";
import Component from "../models/Component.js";
import { evaluateBuildCompatibility } from "../services/compatibility.js";
import { getBuildFixes } from "../services/compatibilityFixes.js";

const router = express.Router();

router.post("/check", async (req, res, next) => {
  try {
    const { selectedPartIds = {} } = req.body;
    const ids = Object.values(selectedPartIds).filter(Boolean);

    if (!ids.length) {
      return res.json({
        isCompatible: true,
        isReady: false,
        status: "incomplete",
        score: 0,
        issues: [],
        warnings: [],
        recommendations: [],
        checks: [],
        missingRequired: ["cpu", "motherboard", "ram", "storage", "psu", "case"],
        totalPrice: 0,
        totalEstimatedWattage: 0,
        recommendedPsuWattage: 0,
        selectedParts: {}
      });
    }

    const parts = await Component.find({ _id: { $in: ids } }).lean();
    const partsByType = {};
    for (const part of parts) {
      partsByType[part.type] = part;
    }

    const result = evaluateBuildCompatibility(partsByType);

    return res.json({
      ...result,
      selectedParts: partsByType
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /suggest-fixes
 * Get actionable fix suggestions for build compatibility issues
 */
router.post("/suggest-fixes", async (req, res, next) => {
  try {
    const { selectedPartIds = {} } = req.body;
    const ids = Object.values(selectedPartIds).filter(Boolean);

    if (!ids.length) {
      return res.json({
        fixes: [],
        suggestedAlternatives: [],
        scoreImprovement: 0
      });
    }

    // Get selected parts
    const parts = await Component.find({ _id: { $in: ids } }).lean();
    const partsByType = {};
    for (const part of parts) {
      partsByType[part.type] = part;
    }

    // Evaluate current build
    const currentResult = evaluateBuildCompatibility(partsByType);

    // Get fixes
    const fixes = await getBuildFixes(currentResult, selectedPartIds);

    // Suggest alternatives for failing checks
    const suggestedAlternatives = [];
    for (const fix of fixes) {
      if (fix.checkStatus === "fail") {
        // Try to find alternative components
        const alternatives = await suggestAlternativesForCheck(
          fix.checkId,
          partsByType,
          selectedPartIds
        );
        suggestedAlternatives.push({
          checkId: fix.checkId,
          checkTitle: fix.checkTitle,
          failingPart: fix.message,
          alternatives
        });
      }
    }

    res.json({
      fixes,
      suggestedAlternatives,
      currentScore: currentResult.score,
      failCount: currentResult.checks.filter((c) => c.status === "fail").length,
      warningCount: currentResult.checks.filter((c) => c.status === "warn").length
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Helper: Suggest compatible alternatives for a failed check
 */
async function suggestAlternativesForCheck(checkId, partsByType, selectedPartIds) {
  const { cpu, motherboard, gpu, psu, cooler, ram } = partsByType;
  const alternatives = [];

  try {
    if (checkId === "cpu_motherboard_socket") {
      // Find CPUs matching motherboard socket
      if (motherboard) {
        const socket = motherboard.specs?.socket;
        const cpus = await Component.find({
          type: "cpu",
          "specs.socket": socket,
          _id: { $ne: cpu?._id }
        })
          .limit(3)
          .lean();

        alternatives.push(
          ...cpus.map((c) => ({
            type: "cpu",
            name: c.name,
            id: c._id,
            price: c.price,
            reason: `Compatible with ${socket} socket`
          }))
        );
      }
    } else if (checkId === "cooler_tdp") {
      // Find coolers matching CPU TDP
      if (cpu) {
        const cpuTdp = cpu.specs?.tdp || 105;
        const cooling_required = cpuTdp + 20; // Add safety margin
        const coolers = await Component.find({
          type: "cpuCooler",
          "specs.tdpRating": { $gte: cooling_required },
          _id: { $ne: cooler?._id }
        })
          .limit(3)
          .lean();

        alternatives.push(
          ...coolers.map((c) => ({
            type: "cpuCooler",
            name: c.name,
            id: c._id,
            price: c.price,
            reason: `Rated for ${cooling_required}W+`
          }))
        );
      }
    } else if (checkId === "psu_wattage") {
      // Find higher wattage PSUs
      if (psu) {
        const psus = await Component.find({
          type: "psu",
          "specs.wattage": { $gt: psu.specs?.wattage || 500 },
          _id: { $ne: psu?._id }
        })
          .limit(3)
          .lean();

        alternatives.push(
          ...psus.map((p) => ({
            type: "psu",
            name: p.name,
            id: p._id,
            price: p.price,
            reason: `${p.specs?.wattage}W capacity`
          }))
        );
      }
    } else if (checkId === "case_form_factor") {
      // Find compatible cases
      if (motherboard) {
        const formFactor = motherboard.specs?.formFactor;
        const cases = await Component.find({
          type: "case",
          "specs.supportedFormFactors": formFactor,
          _id: { $ne: selectedPartIds.case }
        })
          .limit(3)
          .lean();

        alternatives.push(
          ...cases.map((c) => ({
            type: "case",
            name: c.name,
            id: c._id,
            price: c.price,
            reason: `Supports ${formFactor}`
          }))
        );
      }
    } else if (checkId === "gpu_clearance") {
      // Find shorter GPUs
      if (gpu) {
        const maxLength = gpu.specs?.length || 0;
        const gpus = await Component.find({
          type: "gpu",
          "specs.length": { $lt: maxLength },
          _id: { $ne: gpu?._id }
        })
          .limit(3)
          .lean();

        alternatives.push(
          ...gpus.map((g) => ({
            type: "gpu",
            name: g.name,
            id: g._id,
            price: g.price,
            reason: `${g.specs?.length}mm (shorter)`
          }))
        );
      }
    }
  } catch (error) {
    console.error("Error suggesting alternatives:", error);
  }

  return alternatives;
}

export default router;

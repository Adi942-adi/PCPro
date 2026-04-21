import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPublicBuild } from "../api";
import CaseViewer3D from "../components/CaseViewer3D";
import { PART_TYPES } from "../constants";
import { currency } from "../utils/format";
import { estimateFpsByGame, FPS_PRESETS } from "../utils/fpsEstimator";
import { getPartImage } from "../utils/partMedia";

const formatDate = (value) => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
};

export default function PublicBuildPage() {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [build, setBuild] = useState(null);
  const [fpsPreset, setFpsPreset] = useState("1440p");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      setBuild(null);
      try {
        const result = await fetchPublicBuild(shareId);
        setBuild(result.build);
      } catch (err) {
        setError(err.response?.data?.message || "Unable to load shared build.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [shareId]);

  const selectedParts = useMemo(() => {
    const map = {};
    const source = build?.selectedParts || {};
    for (const partType of PART_TYPES) {
      map[partType.key] = source[partType.key] || null;
    }
    return map;
  }, [build]);

  const compatibilityLabel = useMemo(() => {
    const status = build?.compatibility?.status;
    if (status === "ready") {
      return "Compatible";
    }
    if (status === "incompatible") {
      return "Incompatible";
    }
    if (status === "incomplete") {
      return "Incomplete";
    }
    return "Not checked";
  }, [build]);

  const selectedCount = useMemo(() => {
    return Object.values(selectedParts).filter(Boolean).length;
  }, [selectedParts]);

  const fpsEstimate = useMemo(() => {
    return estimateFpsByGame({
      cpu: selectedParts.cpu,
      gpu: selectedParts.gpu,
      presetKey: fpsPreset
    });
  }, [fpsPreset, selectedParts.cpu, selectedParts.gpu]);

  if (loading) {
    return <p>Loading shared build...</p>;
  }

  return (
    <section className="public-build-page">
      {error && (
        <div className="panel dark-panel">
          <p className="error-banner">{error}</p>
          <p>
            <Link to="/builder" className="ghost-link">
              Open Builder
            </Link>
          </p>
        </div>
      )}

      {!error && build && (
        <>
          <header className="panel dark-panel public-build-header">
            <p className="eyebrow">Shared PC Build</p>
            <h1>{build.name}</h1>
            <p className="meta-line">
              Share ID: <code>{build.shareId}</code> | {selectedCount} parts | Updated{" "}
              {formatDate(build.updatedAt)}
            </p>

            <div className="studio-metrics">
              <div className="metric-chip">
                <span>{currency.format(build.totalPrice || 0)}</span>
                <p>Total Price</p>
              </div>
              <div className="metric-chip">
                <span>{compatibilityLabel}</span>
                <p>Compatibility</p>
              </div>
              <div className="metric-chip">
                <span>{build.compatibility?.totalEstimatedWattage || 0}W</span>
                <p>Power Draw</p>
              </div>
              <div className="metric-chip">
                <span>{build.compatibility?.score || 0}/100</span>
                <p>Build Score</p>
              </div>
            </div>
          </header>

          <div className="public-build-layout">
            <section className="panel dark-panel">
              <h2>3D Preview</h2>
              <CaseViewer3D
                casePart={selectedParts.case}
                gpuPart={selectedParts.gpu}
                motherboardPart={selectedParts.motherboard}
              />
            </section>

            <aside className="panel dark-panel">
              <h2>Parts List</h2>
              <div className="public-build-parts">
                {PART_TYPES.map((partType) => {
                  const part = selectedParts[partType.key];
                  return (
                    <article className="public-part-card" key={partType.key}>
                      <h3>{partType.label}</h3>
                      {part ? (
                        <div className="public-part-body">
                          <img src={getPartImage(part)} alt={part.name} loading="lazy" />
                          <div>
                            <p>{part.name}</p>
                            <small>{part.brand}</small>
                            <strong>{currency.format(part.price || 0)}</strong>
                          </div>
                        </div>
                      ) : (
                        <p className="part-empty">Not selected</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </aside>
          </div>

          <section className="panel dark-panel">
            <h2>Compatibility Checks</h2>
            {(build.compatibility?.checks || []).length === 0 && (
              <p className="meta-line">No compatibility checks available.</p>
            )}
            {(build.compatibility?.checks || []).length > 0 && (
              <div className="compat-checks">
                {build.compatibility.checks.map((check) => (
                  <article key={check.id} className={`compat-check ${check.status}`}>
                    <div>
                      <h4>{check.title}</h4>
                      <p>{check.message}</p>
                    </div>
                    <span>{String(check.status || "").toUpperCase()}</span>
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
                {fpsEstimate.notes?.[0] || "CPU and GPU are required for FPS estimates."}
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
              </>
            )}
          </section>

          <section className="panel dark-panel public-build-cta">
            <h2>Create Your Own Build</h2>
            <p className="meta-line">Clone this idea and customize your own compatible PC build.</p>
            <div className="studio-actions">
              <Link to="/signup" className="solid-link">
                Sign Up
              </Link>
              <Link to="/login" className="ghost-link">
                Login
              </Link>
              <Link to="/builder" className="ghost-link">
                Open Builder
              </Link>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

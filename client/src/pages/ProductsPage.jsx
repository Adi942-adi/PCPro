import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPriceAlert, fetchComponentPriceHistory, fetchComponents } from "../api";
import { PART_TYPES } from "../constants";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { currency } from "../utils/format";
import { getPartImage } from "../utils/partMedia";

const createEmptyFilters = () => ({
  search: "",
  socket: "",
  formFactor: "",
  vramMin: "",
  vramMax: "",
  efficiency: "",
  lengthMin: "",
  lengthMax: "",
  radiatorMin: ""
});

const SOCKET_OPTIONS = ["AM4", "AM5", "LGA1700", "LGA1851", "TR5"];
const FORM_FACTOR_OPTIONS = ["ATX", "mATX", "Mini-ITX", "E-ATX"];
const PSU_EFFICIENCY_OPTIONS = ["80+ Bronze", "80+ Silver", "80+ Gold", "80+ Platinum", "80+ Titanium"];
const RADIATOR_OPTIONS = ["120", "140", "240", "280", "360", "420"];

export default function ProductsPage() {
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();

  const [type, setType] = useState("cpu");
  const [filterDraft, setFilterDraft] = useState(() => createEmptyFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => createEmptyFilters());
  const [sortBy, setSortBy] = useState("price");
  const [sortDir, setSortDir] = useState("asc");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [targetById, setTargetById] = useState({});
  const [expandedHistory, setExpandedHistory] = useState({});
  const [historyById, setHistoryById] = useState({});

  const selectedTypeLabel = useMemo(() => {
    return PART_TYPES.find((item) => item.key === type)?.label || "Parts";
  }, [type]);

  const supportsSocketFilter = type === "cpu" || type === "motherboard";
  const supportsFormFactorFilter = type === "motherboard" || type === "case";
  const supportsVramFilter = type === "gpu";
  const supportsEfficiencyFilter = type === "psu";
  const supportsLengthFilter = type === "gpu" || type === "case";
  const supportsRadiatorFilter = type === "case";

  const isFilterRelevant = (key) => {
    if (key === "search") {
      return true;
    }
    if (key === "socket") {
      return supportsSocketFilter;
    }
    if (key === "formFactor") {
      return supportsFormFactorFilter;
    }
    if (key === "vramMin" || key === "vramMax") {
      return supportsVramFilter;
    }
    if (key === "efficiency") {
      return supportsEfficiencyFilter;
    }
    if (key === "lengthMin" || key === "lengthMax") {
      return supportsLengthFilter;
    }
    if (key === "radiatorMin") {
      return supportsRadiatorFilter;
    }
    return true;
  };

  const activeFilterCount = useMemo(() => {
    return Object.entries(appliedFilters).filter(
      ([key, value]) => isFilterRelevant(key) && String(value || "").trim() !== ""
    ).length;
  }, [appliedFilters, type]);

  const updateDraftFilter = (key, value) => {
    setFilterDraft((current) => ({ ...current, [key]: value }));
  };

  const load = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const params = {
        type,
        sortBy,
        sortDir
      };

      if (appliedFilters.search.trim()) {
        params.search = appliedFilters.search.trim();
      }
      if (supportsSocketFilter && appliedFilters.socket.trim()) {
        params.socket = appliedFilters.socket.trim();
      }
      if (supportsFormFactorFilter && appliedFilters.formFactor.trim()) {
        params.formFactor = appliedFilters.formFactor.trim();
      }
      if (supportsVramFilter && appliedFilters.vramMin !== "") {
        params.vramMin = appliedFilters.vramMin;
      }
      if (supportsVramFilter && appliedFilters.vramMax !== "") {
        params.vramMax = appliedFilters.vramMax;
      }
      if (supportsEfficiencyFilter && appliedFilters.efficiency.trim()) {
        params.efficiency = appliedFilters.efficiency.trim();
      }
      if (supportsLengthFilter && appliedFilters.lengthMin !== "") {
        params.lengthMin = appliedFilters.lengthMin;
      }
      if (supportsLengthFilter && appliedFilters.lengthMax !== "") {
        params.lengthMax = appliedFilters.lengthMax;
      }
      if (supportsRadiatorFilter && appliedFilters.radiatorMin !== "") {
        params.radiatorMin = appliedFilters.radiatorMin;
      }

      const data = await fetchComponents(params);
      setItems(data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load products.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [type, sortBy, sortDir, appliedFilters]);

  const onSearchSubmit = (event) => {
    event.preventDefault();
    setAppliedFilters({ ...filterDraft });
  };

  const onClearFilters = () => {
    const empty = createEmptyFilters();
    setFilterDraft(empty);
    setAppliedFilters(empty);
  };

  const onAddToCart = async (componentId) => {
    if (!isAuthenticated) {
      setError("Login required to add items into cart.");
      setSuccess("");
      return;
    }

    try {
      await addItem(componentId, 1);
      setError("");
      setSuccess("Added to cart.");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add to cart.");
      setSuccess("");
    }
  };

  const onSetAlert = async (item) => {
    if (!isAuthenticated) {
      setError("Login required to set price alerts.");
      setSuccess("");
      return;
    }

    const rawTarget = targetById[item._id];
    const fallbackTarget = Number(item.price || 0) * 0.95;
    const targetPrice =
      rawTarget === undefined || rawTarget === "" ? fallbackTarget : Number(rawTarget);

    if (!Number.isFinite(targetPrice) || targetPrice < 0) {
      setError("Target price must be a valid non-negative number.");
      setSuccess("");
      return;
    }

    try {
      await createPriceAlert({ componentId: item._id, targetPrice });
      setError("");
      setSuccess(`Alert saved for ${item.name}.`);
      setTargetById((current) => ({ ...current, [item._id]: String(targetPrice) }));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save price alert.");
      setSuccess("");
    }
  };

  const onToggleHistory = async (item) => {
    const currentOpen = Boolean(expandedHistory[item._id]);
    if (currentOpen) {
      setExpandedHistory((current) => ({ ...current, [item._id]: false }));
      return;
    }

    setExpandedHistory((current) => ({ ...current, [item._id]: true }));
    if (historyById[item._id]?.loaded || historyById[item._id]?.loading) {
      return;
    }

    setHistoryById((current) => ({
      ...current,
      [item._id]: { loaded: false, loading: true, error: "", history: [] }
    }));

    try {
      const result = await fetchComponentPriceHistory(item._id, { limit: 14 });
      setHistoryById((current) => ({
        ...current,
        [item._id]: {
          loaded: true,
          loading: false,
          error: "",
          history: result?.history || []
        }
      }));
    } catch (err) {
      setHistoryById((current) => ({
        ...current,
        [item._id]: {
          loaded: false,
          loading: false,
          error: err.response?.data?.message || "Failed to load price history.",
          history: []
        }
      }));
    }
  };

  return (
    <section className="catalog-page">
      <div className="section-head">
        <h1>{selectedTypeLabel} Catalog</h1>
      </div>

      <form className="catalog-controls" onSubmit={onSearchSubmit}>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {PART_TYPES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sort By
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="price">Price</option>
            <option value="name">Name</option>
            <option value="createdAt">Newest</option>
          </select>
        </label>

        <label>
          Direction
          <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>

        <label>
          Search
          <input
            value={filterDraft.search}
            onChange={(event) => updateDraftFilter("search", event.target.value)}
            placeholder="Name or brand"
          />
        </label>

        <label>
          Socket
          <input
            list="socket-options"
            value={filterDraft.socket}
            onChange={(event) => updateDraftFilter("socket", event.target.value)}
            placeholder="AM5, LGA1700..."
            disabled={!supportsSocketFilter}
          />
        </label>
        <datalist id="socket-options">
          {SOCKET_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <label>
          Form Factor
          <select
            value={filterDraft.formFactor}
            onChange={(event) => updateDraftFilter("formFactor", event.target.value)}
            disabled={!supportsFormFactorFilter}
          >
            <option value="">Any</option>
            {FORM_FACTOR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          VRAM Min (GB)
          <input
            type="number"
            min="0"
            step="1"
            value={filterDraft.vramMin}
            onChange={(event) => updateDraftFilter("vramMin", event.target.value)}
            placeholder="8"
            disabled={!supportsVramFilter}
          />
        </label>

        <label>
          VRAM Max (GB)
          <input
            type="number"
            min="0"
            step="1"
            value={filterDraft.vramMax}
            onChange={(event) => updateDraftFilter("vramMax", event.target.value)}
            placeholder="24"
            disabled={!supportsVramFilter}
          />
        </label>

        <label>
          PSU Efficiency
          <select
            value={filterDraft.efficiency}
            onChange={(event) => updateDraftFilter("efficiency", event.target.value)}
            disabled={!supportsEfficiencyFilter}
          >
            <option value="">Any</option>
            {PSU_EFFICIENCY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Length Min (mm)
          <input
            type="number"
            min="0"
            step="1"
            value={filterDraft.lengthMin}
            onChange={(event) => updateDraftFilter("lengthMin", event.target.value)}
            placeholder="250"
            disabled={!supportsLengthFilter}
          />
        </label>

        <label>
          Length Max (mm)
          <input
            type="number"
            min="0"
            step="1"
            value={filterDraft.lengthMax}
            onChange={(event) => updateDraftFilter("lengthMax", event.target.value)}
            placeholder="350"
            disabled={!supportsLengthFilter}
          />
        </label>

        <label>
          Radiator Support (mm)
          <select
            value={filterDraft.radiatorMin}
            onChange={(event) => updateDraftFilter("radiatorMin", event.target.value)}
            disabled={!supportsRadiatorFilter}
          >
            <option value="">Any</option>
            {RADIATOR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}mm+
              </option>
            ))}
          </select>
        </label>

        <div className="catalog-filter-actions">
          <button type="submit">Apply Filters</button>
          <button type="button" className="ghost-link" onClick={onClearFilters}>
            Clear
          </button>
          <small className="meta-line">Active filters: {activeFilterCount}</small>
        </div>
      </form>

      {error && <p className="error-banner">{error}</p>}
      {success && <p className="success-banner">{success}</p>}

      {loading && <p>Loading products...</p>}

      <div className="product-grid">
        {items.map((item) => (
          <article key={item._id} className="product-card">
            <img src={getPartImage(item)} alt={item.name} className="product-image" loading="lazy" />
            <p className="type-pill">{item.type.toUpperCase()}</p>
            <h3>
              <Link to={`/products/${item._id}`} className="product-name-link">
                {item.name}
              </Link>
            </h3>
            <p>{item.brand}</p>
            <strong>{currency.format(item.price || 0)}</strong>
            <div className="product-card-actions">
              <button type="button" onClick={() => onAddToCart(item._id)}>
                Add to Cart
              </button>
              <button type="button" className="ghost-link" onClick={() => onToggleHistory(item)}>
                {expandedHistory[item._id] ? "Hide History" : "Price History"}
              </button>
              <Link to={`/products/${item._id}`} className="ghost-link">
                Reviews
              </Link>
            </div>

            <div className="product-alert-row">
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetById[item._id] ?? ""}
                onChange={(event) =>
                  setTargetById((current) => ({ ...current, [item._id]: event.target.value }))
                }
                placeholder="Target price"
              />
              <button type="button" className="ghost-link" onClick={() => onSetAlert(item)}>
                Set Alert
              </button>
            </div>

            {expandedHistory[item._id] && (
              <div className="price-history-box">
                {historyById[item._id]?.loading && <p className="meta-line">Loading history...</p>}
                {historyById[item._id]?.error && (
                  <p className="meta-line">{historyById[item._id].error}</p>
                )}
                {historyById[item._id]?.loaded && historyById[item._id]?.history?.length === 0 && (
                  <p className="meta-line">No price history yet.</p>
                )}
                {historyById[item._id]?.loaded && historyById[item._id]?.history?.length > 0 && (
                  <ul className="price-history-list">
                    {historyById[item._id].history.map((point, index, points) => {
                      const next = points[index + 1];
                      const delta = next ? Number(point.price || 0) - Number(next.price || 0) : 0;
                      const deltaClass = delta < 0 ? "price-delta down" : delta > 0 ? "price-delta up" : "price-delta";

                      return (
                        <li key={point._id || `${item._id}-${index}`}>
                          <span>{currency.format(Number(point.price || 0))}</span>
                          {next && (
                            <span className={deltaClass}>
                              {delta > 0 ? "+" : ""}
                              {currency.format(delta)}
                            </span>
                          )}
                          <small>{new Date(point.createdAt).toLocaleDateString("en-US")}</small>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </article>
        ))}
      </div>

      {!loading && items.length === 0 && <p>No products found.</p>}
    </section>
  );
}

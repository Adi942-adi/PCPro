import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchComponents } from "../api";
import { currency } from "../utils/format";
import { getPartImage } from "../utils/partMedia";

const cards = [
  {
    title: "Smart Compatibility",
    description: "Socket, RAM, form-factor, GPU clearance, and PSU checks run in real time."
  },
  {
    title: "Saved Builds",
    description: "Create multiple drafts, compare totals, and keep your favorite configurations."
  },
  {
    title: "Checkout Ready",
    description: "Move selected parts to cart and complete payment from a single flow."
  }
];

export default function HomePage() {
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [cpus, gpus] = await Promise.all([
        fetchComponents({ type: "cpu", sortBy: "price", sortDir: "desc" }),
        fetchComponents({ type: "gpu", sortBy: "price", sortDir: "desc" })
      ]);
      setFeatured([...(cpus || []).slice(0, 2), ...(gpus || []).slice(0, 2)]);
    };
    load().catch(() => setFeatured([]));
  }, []);

  return (
    <div className="home-wrap">
      <section className="hero-panel">
        <p className="eyebrow">BuildCores-Style Experience</p>
        <h1>Assemble your dream PC with a guided configurator.</h1>
        <p>
          Login, create builds, validate compatibility instantly, push parts into cart, and finish
          checkout in one flow.
        </p>
        <div className="hero-cta">
          <Link to="/builder" className="solid-link big">
            Start Building
          </Link>
          <Link to="/products" className="ghost-link big">
            Browse Parts
          </Link>
        </div>
      </section>

      <section className="feature-grid">
        {cards.map((card) => (
          <article key={card.title} className="feature-card">
            <h3>{card.title}</h3>
            <p>{card.description}</p>
          </article>
        ))}
      </section>

      <section className="featured-catalog">
        <div className="section-head">
          <h2>Featured Hardware</h2>
          <Link to="/products">View all</Link>
        </div>
        <div className="product-grid">
          {featured.map((item) => (
            <article key={item._id} className="product-card">
              <img src={getPartImage(item)} alt={item.name} className="product-image" loading="lazy" />
              <p className="type-pill">{item.type.toUpperCase()}</p>
              <h3>{item.name}</h3>
              <p>{item.brand}</p>
              <strong>{currency.format(item.price || 0)}</strong>
            </article>
          ))}
          {featured.length === 0 && <p>Loading featured components...</p>}
        </div>
      </section>
    </div>
  );
}

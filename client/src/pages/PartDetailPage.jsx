import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchComponent,
  fetchComponentReviews,
  submitComponentReview
} from "../api";
import { useAuth } from "../context/AuthContext";
import { currency } from "../utils/format";
import { getPartImage } from "../utils/partMedia";

const MAX_LIST_ITEMS = 8;

const splitListInput = (value) => {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST_ITEMS);
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString("en-US");
};

const emptyForm = {
  rating: "5",
  prosText: "",
  consText: "",
  comment: ""
};

export default function PartDetailPage() {
  const { id } = useParams();
  const { isAuthenticated } = useAuth();

  const [component, setComponent] = useState(null);
  const [reviewsResult, setReviewsResult] = useState(null);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadComponent = async () => {
    setLoading(true);
    try {
      const result = await fetchComponent(id);
      setComponent(result);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load component.");
      setComponent(null);
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async (page = reviewsPage) => {
    setReviewsLoading(true);
    try {
      const result = await fetchComponentReviews(id, { page, limit: 8 });
      setReviewsResult(result);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load reviews.");
      setReviewsResult(null);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    setReviewsPage(1);
    setError("");
    setSuccess("");
    loadComponent();
  }, [id]);

  useEffect(() => {
    loadReviews(reviewsPage);
  }, [id, reviewsPage]);

  useEffect(() => {
    if (!reviewsResult?.myReview) {
      return;
    }
    const mine = reviewsResult.myReview;
    setForm({
      rating: String(mine.rating || 5),
      prosText: Array.isArray(mine.pros) ? mine.pros.join("\n") : "",
      consText: Array.isArray(mine.cons) ? mine.cons.join("\n") : "",
      comment: mine.comment || ""
    });
  }, [reviewsResult?.myReview?.id, reviewsResult?.myReview?.updatedAt]);

  const summary = reviewsResult?.summary || {
    averageRating: 0,
    totalReviews: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };

  const statusLabel = useMemo(() => {
    const status = reviewsResult?.myReview?.status;
    if (!status) {
      return "";
    }
    if (status === "approved") {
      return "Your review is approved.";
    }
    if (status === "rejected") {
      return "Your review was rejected. Update and resubmit.";
    }
    return "Your review is pending moderation.";
  }, [reviewsResult?.myReview?.status]);

  const onSubmitReview = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setError("Login required to submit a review.");
      setSuccess("");
      return;
    }

    const payload = {
      rating: Number(form.rating),
      pros: splitListInput(form.prosText),
      cons: splitListInput(form.consText),
      comment: String(form.comment || "").trim()
    };

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const result = await submitComponentReview(id, payload);
      setSuccess(result?.message || "Review submitted.");
      setReviewsPage(1);
      await loadReviews(1);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p>Loading part details...</p>;
  }

  if (!component) {
    return (
      <section className="panel dark-panel">
        <p className="error-banner">{error || "Component not found."}</p>
        <Link to="/products" className="ghost-link">
          Back to Products
        </Link>
      </section>
    );
  }

  return (
    <section className="part-detail-page">
      {error && <p className="error-banner">{error}</p>}
      {success && <p className="success-banner">{success}</p>}

      <header className="panel dark-panel part-detail-header">
        <div className="part-detail-hero">
          <img src={getPartImage(component)} alt={component.name} className="part-detail-image" />
          <div>
            <p className="type-pill">{component.type?.toUpperCase()}</p>
            <h1>{component.name}</h1>
            <p className="meta-line">{component.brand}</p>
            <p className="part-price">{currency.format(component.price || 0)}</p>
            <Link to="/products" className="ghost-link">
              Back to Products
            </Link>
          </div>
        </div>
      </header>

      <div className="part-detail-layout">
        <section className="panel dark-panel">
          <h2>Ratings Summary</h2>
          {reviewsLoading && !reviewsResult && <p className="meta-line">Loading reviews...</p>}
          <div className="rating-summary-grid">
            <article>
              <h3>{summary.averageRating || 0}/5</h3>
              <p>Average rating</p>
            </article>
            <article>
              <h3>{summary.totalReviews || 0}</h3>
              <p>Approved reviews</p>
            </article>
          </div>

          <div className="rating-distribution">
            {[5, 4, 3, 2, 1].map((score) => (
              <div key={score} className="rating-row">
                <span>{score} / 5</span>
                <div className="rating-track">
                  <div
                    className="rating-fill"
                    style={{
                      width: `${
                        summary.totalReviews
                          ? (Number(summary.distribution?.[score] || 0) / Number(summary.totalReviews)) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
                <strong>{summary.distribution?.[score] || 0}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel dark-panel">
          <h2>Write a Review</h2>
          {!isAuthenticated && (
            <p className="meta-line">
              <Link to="/login" className="ghost-link">
                Login
              </Link>{" "}
              to review this part.
            </p>
          )}

          {isAuthenticated && (
            <>
              {statusLabel && (
                <p className={reviewsResult?.myReview?.status === "approved" ? "ok-pill" : "bad-pill"}>
                  {statusLabel}
                </p>
              )}
              {reviewsResult?.myReview?.moderationNote && (
                <p className="meta-line">Moderator note: {reviewsResult.myReview.moderationNote}</p>
              )}

              <form className="admin-form" onSubmit={onSubmitReview}>
                <label>
                  Rating
                  <select
                    value={form.rating}
                    onChange={(event) => setForm((current) => ({ ...current, rating: event.target.value }))}
                  >
                    <option value="5">5 - Excellent</option>
                    <option value="4">4 - Good</option>
                    <option value="3">3 - Average</option>
                    <option value="2">2 - Below average</option>
                    <option value="1">1 - Poor</option>
                  </select>
                </label>

                <label>
                  Pros (one per line or comma separated)
                  <textarea
                    rows={3}
                    value={form.prosText}
                    onChange={(event) => setForm((current) => ({ ...current, prosText: event.target.value }))}
                    placeholder="Strong performance"
                  />
                </label>

                <label>
                  Cons (one per line or comma separated)
                  <textarea
                    rows={3}
                    value={form.consText}
                    onChange={(event) => setForm((current) => ({ ...current, consText: event.target.value }))}
                    placeholder="Runs hot under load"
                  />
                </label>

                <label>
                  Detailed comment
                  <textarea
                    rows={5}
                    value={form.comment}
                    onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
                    placeholder="Share your real usage feedback"
                  />
                </label>

                <button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Review"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      <section className="panel dark-panel">
        <h2>Approved Reviews</h2>
        {reviewsLoading && <p className="meta-line">Refreshing reviews...</p>}
        {(reviewsResult?.items || []).length === 0 && (
          <p className="meta-line">No approved reviews yet. Be the first to submit one.</p>
        )}
        <div className="reviews-list">
          {(reviewsResult?.items || []).map((review) => (
            <article key={review.id} className="review-card">
              <div className="review-head">
                <p>
                  <strong>{review.user?.name || "User"}</strong> | Rating: {review.rating}/5
                </p>
                <small>{formatDate(review.createdAt)}</small>
              </div>
              {review.comment && <p>{review.comment}</p>}
              {Array.isArray(review.pros) && review.pros.length > 0 && (
                <div>
                  <p className="ok-text">Pros</p>
                  <ul className="plain-list">
                    {review.pros.map((item) => (
                      <li key={`pro-${review.id}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(review.cons) && review.cons.length > 0 && (
                <div>
                  <p className="bad-text">Cons</p>
                  <ul className="plain-list">
                    {review.cons.map((item) => (
                      <li key={`con-${review.id}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>

        {reviewsResult?.pagination && (
          <div className="admin-pagination">
            <button
              type="button"
              className="ghost-link"
              onClick={() => setReviewsPage((page) => Math.max(1, page - 1))}
              disabled={reviewsResult.pagination.page <= 1}
            >
              Previous
            </button>
            <span>
              Page {reviewsResult.pagination.page} / {reviewsResult.pagination.totalPages}
            </span>
            <button
              type="button"
              className="ghost-link"
              onClick={() => setReviewsPage((page) => page + 1)}
              disabled={reviewsResult.pagination.page >= reviewsResult.pagination.totalPages}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </section>
  );
}

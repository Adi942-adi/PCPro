import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: String(error?.message || "Unexpected UI error.")
    };
  }

  componentDidCatch(error) {
    // Keep console output for debugging while showing a visible fallback.
    console.error("AppErrorBoundary caught error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page-shell">
          <section className="panel">
            <h1>Something went wrong</h1>
            <p className="meta-line">{this.state.errorMessage}</p>
            <p className="meta-line">Refresh the page. If it persists, clear browser site data for localhost.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="container" style={{ maxWidth: 560 }}>
      <div className="card empty"><div className="empty-art">!</div><h2>Something went wrong</h2><p className="muted">{error.message || "The page could not be shown."}</p><div className="row" style={{ justifyContent: "center" }}><button className="btn primary" onClick={reset}>Try again</button><a className="btn" href="/">Home</a></div></div>
    </main>
  );
}

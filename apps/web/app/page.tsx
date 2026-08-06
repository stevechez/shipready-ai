export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">
          Deterministic • Provider Agnostic • AI Assisted
        </div>

        <h1 className="max-w-5xl text-5xl font-bold tracking-tight md:text-7xl">
          Ship AI-generated software
          <span className="block text-primary">with confidence.</span>
        </h1>

        <p className="mt-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
          ShipReady turns results from multiple security analyzers into one deterministic
          production-readiness verdict—without letting AI decide whether your software is safe.
        </p>

        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <button
            type="button"
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90"
          >
            Join the Waitlist
          </button>

          <button
            type="button"
            className="rounded-lg border border-border px-6 py-3 font-medium transition hover:bg-muted"
          >
            Read the Architecture
          </button>
        </div>

        <div className="mt-24 grid w-full max-w-5xl gap-6 md:grid-cols-3">
          <FeatureCard
            title="Provider Agnostic"
            description="Semgrep, CodeQL, Trivy, ESLint and future analyzers all become evidence—not the verdict."
          />

          <FeatureCard
            title="Deterministic Policy"
            description="Policy—not AI—determines whether software is ready for production."
          />

          <FeatureCard
            title="Evidence-Based"
            description="Every finding is backed by reproducible evidence with explainable recommendations."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-left">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

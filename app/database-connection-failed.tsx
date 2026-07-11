export function DatabaseConnectionFailed() {
  return (
    <main className="flex h-full min-h-0 items-center justify-center bg-white px-6">
      <section className="w-full max-w-2xl space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-black/50">
            Database connection failed
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            The database URL is configured, but the app cannot connect.
          </h1>
          <p className="text-base leading-7 text-black/70">
            Check that <code>DATABASE_URL</code> points to a running Postgres
            database, the credentials are correct, SSL settings match your
            provider, and network access is allowed from this machine or host.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
          <p className="text-sm font-semibold text-black">What to verify</p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-black/70">
            <li>The Postgres server is running and reachable.</li>
            <li>The username, password, host, port, and database name are correct.</li>
            <li>The database supports <code>pgvector</code>.</li>
            <li>After fixing the URL, restart the Next.js server.</li>
          </ul>
        </div>

        <p className="text-sm leading-6 text-black/60">
          Supported today: Postgres-compatible databases with <code>pgvector</code>,
          such as Prisma Postgres, Supabase, Neon, RDS/Postgres, or local Postgres.
          MongoDB, SQLite, MySQL, and document databases require code changes.
        </p>
      </section>
    </main>
  );
}

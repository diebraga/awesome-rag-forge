export function DatabaseSetupRequired() {
  return (
    <main className="flex h-full min-h-0 items-center justify-center bg-white px-6">
      <section className="w-full max-w-2xl space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-black/50">
            Database required
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Add a database connection before using this project.
          </h1>
          <p className="text-base leading-7 text-black/70">
            <code>DATABASE_URL</code> is the minimum required configuration. The
            app, MCP server, seed script, and Prisma schema all require the same
            Postgres database with <code>pgvector</code>. Configure it first,
            then restart the server.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
          <p className="text-sm font-semibold text-black">Add this to your environment</p>
          <pre className="overflow-x-auto rounded-md bg-black p-3 text-sm text-white">
            <code>{'DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"'}</code>
          </pre>
          <p className="text-sm leading-6 text-black/60">
            Use a Postgres-compatible provider with the <code>pgvector</code>
            extension enabled, then run <code>npx prisma db push</code> and
            <code> npm run db:seed</code>.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
          <p className="text-sm font-semibold text-black">Optional file bucket</p>
          <p className="text-sm leading-6 text-black/70">
            PDF uploads work through the MCP server even without bucket keys: the
            file is scanned, selectable text is extracted, scanned pages use OCR,
            and cleaned text is saved into the RAG database.
          </p>
          <p className="text-sm leading-6 text-black/70">
            Add <code>STORAGE_BUCKET</code>, <code>STORAGE_ACCESS_KEY_ID</code>,
            and <code>STORAGE_SECRET_ACCESS_KEY</code> only if you also want to
            keep original PDFs for later download. S3-compatible providers such
            as Cloudflare R2, AWS S3, and MinIO are supported.
          </p>
        </div>

        <div className="space-y-2 text-sm leading-6 text-black/60">
          <p>
            Supported today: Prisma Postgres, Supabase, Neon, RDS/Postgres, local
            Postgres, or another Postgres-compatible database that supports
            <code> pgvector</code>.
          </p>
          <p>
            Not supported today: MongoDB, SQLite, MySQL, or document databases
            without changing the Prisma schema and storage layer.
          </p>
        </div>
      </section>
    </main>
  );
}

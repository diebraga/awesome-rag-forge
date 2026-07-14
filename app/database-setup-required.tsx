import { SetupActions } from "./setup-actions";

function EnvVar({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-black/5 px-1.5 py-0.5 text-[0.95em] text-black">
      {children}
    </code>
  );
}

export function DatabaseSetupRequired() {
  return (
    <main className="h-full overflow-y-auto bg-white px-6 py-10 text-black">
      <section className="mx-auto w-full max-w-2xl space-y-6 pb-10">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-black/50">
            Database required
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            Add a database connection before using this project.
          </h1>
          <p className="text-base leading-7 text-black/70">
            <EnvVar>DATABASE_URL</EnvVar> is the minimum required configuration. The
            app, MCP server, seed script, and Prisma schema all require the same
            Postgres database with <EnvVar>pgvector</EnvVar>. Configure it first,
            then restart the server.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
          <p className="text-sm font-semibold text-black">Add this to your environment</p>
          <pre className="overflow-x-auto rounded-md bg-black p-3 text-sm text-white">
            <code>{'DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"'}</code>
          </pre>
          <p className="text-sm leading-6 text-black/60">
            Use a Postgres-compatible provider with the <EnvVar>pgvector</EnvVar>
            extension enabled, then run <EnvVar>npx prisma db push</EnvVar> and
            <EnvVar>npm run db:seed</EnvVar>.
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
            Add <EnvVar>STORAGE_BUCKET</EnvVar>, <EnvVar>STORAGE_ACCESS_KEY_ID</EnvVar>,
            and <EnvVar>STORAGE_SECRET_ACCESS_KEY</EnvVar> only if you also want to
            keep original PDFs for later download. S3-compatible providers such
            as Cloudflare R2, AWS S3, and MinIO are supported.
          </p>
        </div>

        <SetupActions />

        <div className="space-y-2 text-sm leading-6 text-black/60">
          <p>
            Supported today: Prisma Postgres, Supabase, Neon, RDS/Postgres, local
            Postgres, or another Postgres-compatible database that supports
            <EnvVar>pgvector</EnvVar>.
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

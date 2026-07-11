# Local Postgres Setup

This project is domain-agnostic, but it is not database-engine-agnostic. It requires PostgreSQL with the `pgvector` extension because Prisma maps `RagChunk.embedding` to a Postgres `vector(768)` column. SQLite, MongoDB, MySQL, and document databases require code and schema changes.

## Choose a database path

When an AI assistant is setting up the repository for a user, it should offer two choices before running database commands:

1. **Use an existing Postgres URL** — the user provides a real `DATABASE_URL` from Prisma Postgres, Supabase, Neon, RDS/Postgres, local Postgres, or another Postgres-compatible provider with `pgvector`.
2. **Create a local Postgres database** — recommended for first local setup when the user does not already have a database URL. Use Docker first because it is repeatable and does not modify a system Postgres install.

Never invent remote credentials. The only credentials an assistant may generate are local-only development credentials for a database it creates on the user's machine after permission.

## Docker-first local setup

Ask permission before starting Docker or creating a local database. If Docker is installed and running, use:

```bash
npm run db:local:up
```

Then set this in `.env`:

```env
DATABASE_URL="postgresql://awesome_rag_forge:awesome_rag_forge@127.0.0.1:54329/awesome_rag_forge?schema=public"
```

Then initialize the schema and seed data:

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

Start the app:

```bash
npm run dev
```

The Compose service uses `pgvector/pgvector:pg16` and runs `scripts/local-postgres-init.sql`, which enables `CREATE EXTENSION IF NOT EXISTS vector;` on first initialization.

## If Docker is missing

Do not silently install Docker or native Postgres. Tell the user what is missing and ask whether they want help installing it. Good options are:

- Install Docker Desktop, then rerun `npm run db:local:up`.
- Use a managed Postgres provider and paste its `DATABASE_URL`.
- Install native Postgres plus `pgvector`, then create a database and run `CREATE EXTENSION IF NOT EXISTS vector;`.

If the user approves installation, prefer the least invasive route for their machine. On macOS that is usually Docker Desktop for non-technical users, or Homebrew Postgres + pgvector for developers who explicitly choose native Postgres.

## Agent setup prompt

Use this wording when a user drops the repository link into an AI assistant:

```md
This project requires PostgreSQL with pgvector. Prisma is used, but the app is not database-engine-agnostic because the schema uses a Postgres vector(768) column. MongoDB, SQLite, MySQL, and document databases are not supported without code changes.

Do you already have a Postgres DATABASE_URL with pgvector enabled, or do you want me to create a local Postgres database for this project?

If you choose local setup, I recommend Docker. With your permission I will check whether Docker is installed and running, start the included pgvector Postgres service, write the local DATABASE_URL to .env, run prisma db push, seed the database, and start the dev server. If Docker or Postgres is missing, I will ask before installing anything system-level.
```

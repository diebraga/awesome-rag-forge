# Export / Import

Use the portable brain CLI when moving knowledge between Awesome RAG Forge databases or embedding this brain into an existing Postgres-backed app.

## Export

Export approved knowledge and approved harness/config state:

```bash
npm run brain:export -- --output brain.json
```

Include pending review rows:

```bash
npm run brain:export -- --include-pending --output brain-with-review.json
```

Include feedback and review history:

```bash
npm run brain:export -- --include-feedback --output brain-with-feedback.json
```

Both flags can be combined:

```bash
npm run brain:export -- --include-pending --include-feedback --output brain-full.json
```

## Import

Always dry-run first:

```bash
npm run brain:import -- --file brain.json
```

Apply with duplicate-safe inserts:

```bash
npm run brain:import -- --file brain.json --apply --mode skip
```

Overwrite matching ids when intentionally refreshing a target database:

```bash
npm run brain:import -- --file brain.json --apply --mode upsert
```

After any import, rebuild vectors:

```bash
npm run rag:embeddings:backfill
```

## Safety notes

The import command writes only when `--apply` is present. Without `--apply`, it reports how many incoming rows already exist and how many would be inserted.

Snapshots do not contain secrets and do not contain `.env` values. They may contain knowledge, source text, feedback, and review notes, so treat them as sensitive project data.

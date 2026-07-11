export function TestingApiAuthRequired() {
  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-white px-4 py-8 text-black">
      <section className="w-full max-w-2xl space-y-5">
        <header className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-blue-600">Setup required</p>
          <h1 className="text-2xl font-semibold tracking-tight">Testing API key is missing</h1>
          <p className="text-sm leading-6 text-black/60">
            The testing surface is enabled in this deployed environment, but{" "}
            <code className="rounded bg-black/5 px-1 py-0.5">APP_API_KEY</code> is not configured.
            Add a strong key in your deployment settings before exposing the chat, collections,
            harness, feedback, RAG debug, document download, or Ollama helper endpoints.
          </p>
        </header>

        <div className="space-y-2 rounded-xl border border-black/10 p-4">
          <h2 className="text-sm font-semibold">What to set</h2>
          <pre className="overflow-x-auto rounded-lg bg-black/[0.03] p-3 text-xs text-black/70">
            <code>APP_API_KEY=&quot;use-a-long-random-secret&quot;</code>
          </pre>
          <p className="text-sm leading-6 text-black/60">
            After it is set, reload this page. The browser UI will ask you to enter that same key
            once and will attach it to protected testing API requests as a bearer token.
          </p>
        </div>
      </section>
    </main>
  );
}

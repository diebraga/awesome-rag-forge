export function TestingSurfaceDisabled() {
  return (
    <main className="flex h-full min-h-0 items-center justify-center bg-white px-6">
      <section className="w-full max-w-2xl space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-black/50">
            Testing mode is off
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-black">
            The testing surface is disabled in this environment.
          </h1>
          <p className="text-base leading-7 text-black/70">
            This project hides the chat, collections, harness, feedback, RAG, and
            Ollama testing routes unless <code>ENABLE_TESTING_SURFACE</code> is set
            to <code>true</code>. Missing or unset means off, which is why a fresh
            Vercel deployment will show this message until you opt in.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.02] p-4">
          <p className="text-sm font-semibold text-black">Turn it on locally</p>
          <pre className="overflow-x-auto rounded-md bg-black p-3 text-sm text-white">
            <code>ENABLE_TESTING_SURFACE=true</code>
          </pre>
          <p className="text-sm leading-6 text-black/60">
            Add that to <code>.env</code>, then restart the Next.js server.
          </p>
        </div>

        <div className="space-y-2 text-sm leading-6 text-black/60">
          <p>
            On Vercel or another host, add the same environment variable and
            redeploy when you intentionally want these testing routes exposed.
          </p>
          <p>
            Keep it off for public deployments until authentication is in place.
          </p>
        </div>
      </section>
    </main>
  );
}

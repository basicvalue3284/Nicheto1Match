"use client";

import { FormEvent, useState } from "react";

type ResearcherMap = {
  appToolName: string;
  goal: string;
  preparation: string;
  flow: string[];
  trickyPart: string;
};

export default function Home() {
  const [title, setTitle] = useState("");
  const [researcherMap, setResearcherMap] = useState<ResearcherMap | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTitle = title.trim();
    if (!cleanTitle || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    setCopied(false);
    setResearcherMap(null);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ title: cleanTitle })
      });

      const data = (await response.json()) as {
        map?: ResearcherMap;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not generate the researcher map.");
      }

      if (!data.map) {
        throw new Error("No researcher map was returned.");
      }

      setResearcherMap(data.map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setResearcherMap(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function copyFlow() {
    if (!researcherMap?.flow.length) {
      return;
    }

    const flowText = researcherMap.flow
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n");

    await navigator.clipboard.writeText(flowText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="rounded-lg border border-line bg-panel/90 p-5 shadow-glow backdrop-blur sm:p-7">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">
              YouTube Production Workflow
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Generate a detailed one-take recording map before scripting or recording a tutorial.
            </p>
          </div>
        </header>

        <div className="rounded-lg border border-line bg-panel/90 p-5 backdrop-blur sm:p-7">
          <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2">
              <label
                htmlFor="title"
                className="block text-sm font-medium text-slate-200"
              >
                Tutorial Video Title
              </label>
              <input
                id="title"
                name="title"
                type="search"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="TradingView broker setup"
                className="w-full rounded-md border border-line bg-ink px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-ninja focus:ring-2 focus:ring-ninja/30"
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !title.trim()}
              className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-ninja px-5 py-3 text-base font-semibold text-ink transition hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isLoading && (
                <span
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin rounded-full border-2 border-ink/25 border-t-ink"
                />
              )}
              {isLoading ? "Generating map..." : "Generate Researcher Map"}
            </button>
          </form>
        </div>

        {(researcherMap || error) && (
          <section className="rounded-lg border border-line bg-panel/90 p-5 backdrop-blur sm:p-7">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ninja">
                  One-Take Recording Map
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  {researcherMap?.appToolName || "Generation issue"}
                </h2>
              </div>
            </div>

            {error ? (
              <p className="rounded-md border border-red-900/60 bg-red-950/30 p-4 text-sm leading-6 text-red-300">
                {error}
              </p>
            ) : researcherMap ? (
              <div className="grid gap-4">
                <section className="rounded-md border border-line bg-ink p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    App / Tool Name
                  </h3>
                  <p className="mt-2 text-base text-slate-100">
                    {researcherMap.appToolName}
                  </p>
                </section>

                <section className="rounded-md border border-line bg-ink p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    The Goal
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-100">
                    {researcherMap.goal}
                  </p>
                </section>

                <section className="rounded-md border border-line bg-ink p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Preparation
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                    {researcherMap.preparation}
                  </p>
                </section>

                <section className="rounded-md border border-line bg-ink p-4">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      In-Detail Step-By-Step
                    </h3>
                    <button
                      type="button"
                      onClick={copyFlow}
                      className="rounded-md border border-line px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-ninja hover:text-ninja"
                    >
                      {copied ? "Copied" : "Copy Flow"}
                    </button>
                  </div>
                  <ol className="space-y-2 pl-5 text-sm leading-6 text-slate-100">
                    {researcherMap.flow.map((step, index) => (
                      <li key={`${step}-${index}`} className="pl-1">
                        {step}
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="rounded-md border border-amber-500/30 bg-amber-950/20 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-300">
                    The One-Take Warnings
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-amber-100">
                    {researcherMap.trickyPart}
                  </p>
                </section>
              </div>
            ) : null}
          </section>
        )}
      </section>
    </main>
  );
}

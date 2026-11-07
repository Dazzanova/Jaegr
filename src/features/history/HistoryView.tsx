"use client";

import React from "react";
import { StoredTestRun } from "@/server/persistence/repository";
import { ResultCard } from "../test-runs/ResultCard";
import { History, ArrowRight } from "lucide-react";

interface HistoryViewProps {
  runs: StoredTestRun[];
  onNavigateToWorkbench: () => void;
}

export function HistoryView({ runs, onNavigateToWorkbench }: HistoryViewProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <History className="w-7 h-7 text-purple-400" />
            <span>Audit Run History</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Persisted security audit logs from local SQLite storage.
          </p>
        </div>

        <button
          onClick={onNavigateToWorkbench}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto"
        >
          <span>New Test Run</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-slate-800 bg-slate-900/20 space-y-3">
          <History className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No test runs recorded in database</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Runs executed through the workbench will automatically be saved and indexed here for review.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map((run) => (
            <ResultCard key={run.runId} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

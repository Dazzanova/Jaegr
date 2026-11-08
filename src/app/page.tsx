"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { DashboardView } from "@/features/dashboard/DashboardView";
import { WorkbenchView } from "@/features/test-runs/WorkbenchView";
import { ScenariosView } from "@/features/scenarios/ScenariosView";
import { HistoryView } from "@/features/history/HistoryView";
import { ScenarioItem } from "@/features/scenarios/ScenarioCard";
import { StoredTestRun, SummaryStats } from "@/server/persistence/repository";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "workbench" | "scenarios" | "history">("dashboard");
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [recentRuns, setRecentRuns] = useState<StoredTestRun[]>([]);
  const [stats, setStats] = useState<SummaryStats>({
    totalRuns: 0,
    totalCompromised: 0,
    totalResisted: 0,
    totalBlockedByPolicy: 0,
    totalPassedByPolicy: 0,
    distinctScenariosTested: 0
  });
  const [geminiAvailable, setGeminiAvailable] = useState<boolean>(false);

  const reloadData = useCallback(async () => {
    try {
      const [scenariosRes, profilesRes, runsRes] = await Promise.all([
        fetch("/api/scenarios"),
        fetch("/api/profiles"),
        fetch("/api/test-runs?limit=20")
      ]);

      if (scenariosRes.ok) {
        const data = await scenariosRes.json();
        setScenarios(data.scenarios || []);
      }

      if (profilesRes.ok) {
        const data = await profilesRes.json();
        setGeminiAvailable(Boolean(data.geminiConfigured));
      }

      if (runsRes.ok) {
        const data = await runsRes.json();
        setRecentRuns(data.runs || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (e) {
      console.error("Failed to fetch application data:", e);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const runFetch = async () => {
      try {
        const [scenariosRes, profilesRes, runsRes] = await Promise.all([
          fetch("/api/scenarios"),
          fetch("/api/profiles"),
          fetch("/api/test-runs?limit=20")
        ]);

        if (ignore) return;

        if (scenariosRes.ok) {
          const data = await scenariosRes.json();
          setScenarios(data.scenarios || []);
        }

        if (profilesRes.ok) {
          const data = await profilesRes.json();
          setGeminiAvailable(Boolean(data.geminiConfigured));
        }

        if (runsRes.ok) {
          const data = await runsRes.json();
          setRecentRuns(data.runs || []);
          if (data.stats) {
            setStats(data.stats);
          }
        }
      } catch (e) {
        if (!ignore) console.error("Failed to load initial data:", e);
      }
    };

    runFetch();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-purple-900 selection:text-white">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        geminiAvailable={geminiAvailable}
      />

      <main className="flex-1">
        {activeTab === "dashboard" && (
          <DashboardView
            stats={stats}
            recentRuns={recentRuns}
            scenarios={scenarios}
            onStartRun={() => setActiveTab("workbench")}
            onNavigateToWorkbench={() => setActiveTab("workbench")}
            onNavigateToScenarios={() => setActiveTab("scenarios")}
          />
        )}

        {activeTab === "workbench" && (
          <WorkbenchView
            scenarios={scenarios}
            geminiAvailable={geminiAvailable}
            onRunComplete={reloadData}
          />
        )}

        {activeTab === "scenarios" && (
          <ScenariosView
            scenarios={scenarios}
            onSelectScenario={() => setActiveTab("workbench")}
          />
        )}

        {activeTab === "history" && (
          <HistoryView
            runs={recentRuns}
            onNavigateToWorkbench={() => setActiveTab("workbench")}
          />
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">Jaegr</span>
            <span>•</span>
            <span>Track: Solana AI</span>
            <span>•</span>
            <span>SDK: @solana/kit 8.6.0</span>
          </div>
          <div>
            Built with Next.js App Router, Drizzle SQLite, and Google GenAI. Explicit wallet-approved execution is Devnet-only.
          </div>
        </div>
      </footer>
    </div>
  );
}

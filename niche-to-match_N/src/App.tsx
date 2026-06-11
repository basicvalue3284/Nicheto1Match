/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Globe, 
  Search, 
  Terminal, 
  PieChart as PieIcon, 
  TrendingUp, 
  Download, 
  Trash2, 
  Grid, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  HelpCircle, 
  Layers, 
  Filter, 
  Plus, 
  X, 
  ExternalLink,
  Loader2,
  Sparkles,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ScrapedPage, NicheMatch, BatchProgress } from './types.js';

const DEFAULT_NICHES = [
  "SaaS & Cloud Software",
  "AI & Large Language Models",
  "Biohacking & Longevity",
  "Micro-SaaS & Boilerplates",
  "Keto & Nutrition Plans",
  "Remote Work & Nomads",
  "Sustainability & EcoTech",
  "FinTech & DeFi Wealth"
];

const SAMPLE_WEBSITES = [
  { url: "openai.com", info: "Creative AI Research" },
  { url: "medium.com", info: "Blogging & Publication Hub" },
  { url: "lexica.art", info: "AI Image Prompt Repository" },
  { url: "stripe.com", info: "Global Online Payment Services" },
  { url: "fitbit.com", info: " wearable fitness trackers" }
];

export default function App() {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("n2m_token") !== null;
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(false);

  // Core application states
  const [niches, setNiches] = useState<string[]>(DEFAULT_NICHES);
  const [newNiche, setNewNiche] = useState('');
  const [inputMode, setInputMode] = useState<'url' | 'raw'>('url');
  const [rawUrls, setRawUrls] = useState('');
  const [rawTitles, setRawTitles] = useState('');
  const [batchSize, setBatchSize] = useState(25);
  const [results, setResults] = useState<NicheMatch[]>(() => {
    const saved = localStorage.getItem("n2m_results");
    return saved ? JSON.parse(saved) : [];
  });
  const [aiProvider, setAiProvider] = useState<'openai' | 'gemini'>('openai');
  const [youtubeData, setYoutubeData] = useState<Record<string, { loading: boolean; videos: any[]; simulated?: boolean; error?: string }>>({});

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNicheFilter, setSelectedNicheFilter] = useState('All');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

  // Selected row for detail model/drawer
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Terminal and batch progress state
  const [progress, setProgress] = useState<BatchProgress>({
    id: '',
    status: 'idle',
    total: 0,
    current: 0,
    logs: ['[System] Engine online. Configure inputs above to run categorization.']
  });

  // Save results to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("n2m_results", JSON.stringify(results));
  }, [results]);

  // Step 3 background researcher: load relevant YouTube benchmarks
  const fetchYoutubeResearch = async (title: string, keywords: string[]) => {
    if (youtubeData[title]) return; // already loaded or loading

    setYoutubeData(prev => ({
      ...prev,
      [title]: { loading: true, videos: [], simulated: false }
    }));

    try {
      const query = keywords && keywords.length > 0 ? keywords[0] : title;
      const token = localStorage.getItem("n2m_token") || "";
      
      const response = await fetch("/api/youtube-research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`HTTP Error Status: ${response.status}`);
      }

      const data = await response.json();
      setYoutubeData(prev => ({
        ...prev,
        [title]: {
          loading: false,
          videos: data.videos || [],
          simulated: !!data.simulated,
          error: data.error
        }
      }));
    } catch (err: any) {
      setYoutubeData(prev => ({
        ...prev,
        [title]: {
          loading: false,
          videos: [],
          simulated: true,
          error: err.message
        }
      }));
    }
  };

  useEffect(() => {
    if (selectedRowId) {
      const item = results.find(r => r.title === selectedRowId);
      if (item) {
        fetchYoutubeResearch(item.title, item.suggestedKeywords || []);
      }
    }
  }, [selectedRowId, results]);

  // Handle Authentication submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckingAuth(true);
    setAuthError('');
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem("n2m_token", `Bearer ${data.token}`);
        setIsAuthenticated(true);
      } else {
        setAuthError(data.error || "Login Verification Failed.");
      }
    } catch (err) {
      setAuthError("Could not connect to authentication gateway server.");
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("n2m_token");
    setIsAuthenticated(false);
  };

  // Log addition helper
  const addLog = (msg: string) => {
    const stamp = new Date().toLocaleTimeString();
    setProgress(prev => ({
      ...prev,
      logs: [...prev.logs, `[${stamp}] ${msg}`]
    }));
  };

  // Add a targeted niche
  const handleAddNiche = () => {
    const clean = newNiche.trim();
    if (clean && !niches.includes(clean)) {
      setNiches(prev => [...prev, clean]);
      setNewNiche('');
    }
  };

  // Remove a targeted niche
  const handleRemoveNiche = (indexToRemove: number) => {
    setNiches(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Auto populate inputs from preset examples
  const loadPresets = () => {
    if (inputMode === 'url') {
      setRawUrls(SAMPLE_WEBSITES.map(s => s.url).join('\n'));
      addLog("Loaded sample web URL addresses. Click 'Process Engine' to try!");
    } else {
      setRawTitles("Svelte SEO Booster and Core Optimizer\nPure Green Organic Diet Planner App\nZenBreath - Mindful Diaphragmatic Loop Player\nStripe Payment Custom Webhooks Broker\nUltimate Nomad Packing Guide & Gear lists");
      addLog("Loaded sample mock page titles. Ready for categorization.");
    }
  };

  // Execution: Scrape and Categorize pipeline
  const runCategorizeEngine = async () => {
    if (progress.status !== 'idle') return;

    let itemsToProcess: { url: string; title: string; description?: string; h1?: string; keywords?: string[] }[] = [];
    const token = localStorage.getItem("n2m_token") || "";

    if (inputMode === 'url') {
      const urls = rawUrls.split('\n').map(u => u.trim()).filter(Boolean);
      if (urls.length === 0) {
        addLog("Error: No URLs entered inside the processing deck.");
        return;
      }

      setProgress({
        id: Math.random().toString(36).substr(2, 9),
        status: 'scraping',
        total: urls.length,
        current: 0,
        logs: [`[System] Initiating process for ${urls.length} target sites...`]
      });

      // Part 1: Scrape titles and page keywords
      let scrapedPages: ScrapedPage[] = [];
      try {
        const response = await fetch("/api/scrape", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": token
          },
          body: JSON.stringify({ urls }),
        });

        if (!response.ok) {
          throw new Error(`HTTP pipeline breakdown (${response.status})`);
        }

        const data = await response.json();
        scrapedPages = data.results;
      } catch (err: any) {
        setProgress(p => ({
          ...p,
          status: 'idle',
          logs: [...p.logs, `[Error] Scraping gateway server connection failed: ${err.message}`]
        }));
        return;
      }

      // Populate item list
      itemsToProcess = scrapedPages.map(page => ({
        url: page.url,
        title: page.title || "",
        description: page.description || "",
        h1: page.h1 || "",
        keywords: page.keywords || []
      }));

      setProgress(p => ({
        ...p,
        status: 'categorizing',
        logs: [...p.logs, `[Scrape] Complete! Received metadata for ${scrapedPages.filter(p => p.success).length}/${scrapedPages.length}. Sending to ${aiProvider === 'openai' ? 'OpenAI GPT-4o-Mini' : 'Gemini-2.5-Flash'}...`]
      }));

    } else {
      // Direct raw title input mode
      const lines = rawTitles.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        addLog("Error: No raw titles added to match entries.");
        return;
      }

      setProgress({
        id: Math.random().toString(36).substr(2, 9),
        status: 'categorizing',
        total: lines.length,
        current: 0,
        logs: [`[System] Loading direct title matching module via ${aiProvider === 'openai' ? 'OpenAI' : 'Gemini'}. Processing ${lines.length} manual records...`]
      });

      itemsToProcess = lines.map(line => ({
        url: 'Manual Entry',
        title: line,
        description: 'Manual titles entry session bypasses proxy scraping.',
        h1: line,
        keywords: ['manual', 'custom']
      }));
    }

    // Part 2: Categorization with server-side Dual AI
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token
        },
        body: JSON.stringify({
          items: itemsToProcess,
          availableNiches: niches,
          provider: aiProvider
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Match Fail: HTTP ${response.status}`);
      }

      const matchData = await response.json();
      const newMatches: NicheMatch[] = matchData.matches;

      // Append and complete
      setResults(prev => {
        // Prevent duplicate matches for the exact same Title/URL
        const filteredPrev = prev.filter(p => !newMatches.some(n => n.title === p.title));
        return [...newMatches, ...filteredPrev];
      });

      setProgress(p => ({
        ...p,
        status: 'completed',
        current: p.total,
        logs: [
          ...p.logs,
          `[AI Matches] Success! Mapped ${newMatches.length} items using structured category mapping (${aiProvider === 'openai' ? 'OpenAI' : 'Gemini'}).`,
          `[System] Results added to directory catalog.`
        ]
      }));

    } catch (err: any) {
      setProgress(p => ({
        ...p,
        status: 'failed',
        logs: [...p.logs, `[Error] AI Matching process aborted: ${err.message}`]
      }));
    }
  };

  // Purely resets the processing terminal state back to IDLE
  const resetProgressEngine = () => {
    setProgress({
      id: '',
      status: 'idle',
      total: 0,
      current: 0,
      logs: ['[System] Engine reset. Ready for next categorization queue.']
    });
  };

  // CSV Exporter
  const downloadCSV = () => {
    if (results.length === 0) return;
    const headers = ["Title", "Source URL", "Primary Niche", "Secondary Niche", "Match Score %", "Target Audience", "Monetization Idea", "Keywords"];
    const rows = results.map(r => [
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.url}"`,
      `"${r.primaryNiche.replace(/"/g, '""')}"`,
      `"${r.secondaryNiche.replace(/"/g, '""')}"`,
      r.matchScore,
      `"${r.targetAudience.replace(/"/g, '""')}"`,
      `"${r.monetizationIdea.replace(/"/g, '""')}"`,
      `"${r.suggestedKeywords.join(', ')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `niche_to_match_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSON Exporter
  const downloadJSON = () => {
    if (results.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `niche_to_match_catalog_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearCatalog = () => {
    if (confirm("Are you sure you want to flush the current results catalog?")) {
      setResults([]);
      addLog("Cleared matched catalog archive.");
    }
  };

  // Computed properties
  const filteredResults = useMemo(() => {
    return results.filter(item => {
      // 1. Search box check
      const query = searchTerm.toLowerCase();
      const docsMatch = item.title.toLowerCase().includes(query) || 
                         item.url.toLowerCase().includes(query) || 
                         item.primaryNiche.toLowerCase().includes(query) ||
                         item.reasoning.toLowerCase().includes(query) ||
                         item.suggestedKeywords.some(k => k.toLowerCase().includes(query));

      if (!docsMatch) return false;

      // 2. Niche category dropdown filter
      if (selectedNicheFilter !== 'All' && item.primaryNiche !== selectedNicheFilter) return false;

      // 3. Match score ranges
      if (scoreFilter === 'high') return item.matchScore >= 80;
      if (scoreFilter === 'mid') return item.matchScore >= 50 && item.matchScore < 80;
      if (scoreFilter === 'low') return item.matchScore < 50;

      return true;
    });
  }, [results, searchTerm, selectedNicheFilter, scoreFilter]);

  const uniqueMatchedNiches = useMemo(() => {
    const set = new Set<string>();
    results.forEach(r => set.add(r.primaryNiche));
    return Array.from(set);
  }, [results]);

  const statistics = useMemo(() => {
    if (results.length === 0) return { total: 0, averageScore: 0, highConfidence: 0, topNiche: 'None' };
    
    const total = results.length;
    const sum = results.reduce((acc, r) => acc + r.matchScore, 0);
    const averageScore = Math.round(sum / total);
    const highConfidence = results.filter(r => r.matchScore >= 80).length;

    // Freq map matching
    const nicheCounts: Record<string, number> = {};
    results.forEach(r => {
      nicheCounts[r.primaryNiche] = (nicheCounts[r.primaryNiche] || 0) + 1;
    });
    
    let topNiche = 'None';
    let max = -1;
    Object.entries(nicheCounts).forEach(([n, c]) => {
      if (c > max) {
        max = c;
        topNiche = n;
      }
    });

    return { total, averageScore, highConfidence, topNiche };
  }, [results]);

  // Selected details item
  const activeDetailItem = useMemo(() => {
    return results.find(r => r.title === selectedRowId) || null;
  }, [results, selectedRowId]);


  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-teal-500 selection:text-white">
      
      {/* Header Banner App Branding */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-tr from-teal-500 to-indigo-600 shadow-md">
              <Sparkles className="h-5 w-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Niche to Match <span className="text-[10px] bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded-full font-medium select-none border border-teal-500/20">Gemini Powered</span>
              </h1>
              <p className="text-xs text-slate-400">SEO & Market Niche Categorization System</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <span className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700/60 hidden sm:inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse"></span>
                  Active Secure Session
                </span>
                <button 
                  onClick={handleLogout}
                  className="text-xs text-slate-400 bg-slate-800 hover:text-white hover:bg-slate-700 font-medium px-3 py-1.5 rounded-lg border border-slate-700 transition"
                  id="header_logout_btn"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                <Lock className="h-3 w-3" /> Locked
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        
        <AnimatePresence mode="wait">
          {!isAuthenticated ? (

            /* Lock Screen Display Block */
            <motion.div 
              key="auth-sec"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-md mx-auto my-16 bg-slate-950 rounded-2xl border border-slate-800 p-8 shadow-2xl relative overflow-hidden"
              id="auth_card"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-indigo-600" />
              
              <div className="text-center mb-8">
                <div className="mx-auto h-12 w-12 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center mb-3 border border-teal-500/20">
                  <Lock className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-bold text-white">Security Validation</h2>
                <p className="text-sm text-slate-400 mt-1">Please enter your APP_PASS password credentials to access Niche to Match.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Username</label>
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter configured APP_USER (Default: admin)"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Console Password</label>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter APP_PASS security key"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-200 rounded-xl px-4 py-2.5 text-sm transition outline-none"
                    required
                  />
                </div>

                {authError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-3 text-xs flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={checkingAuth}
                  className="w-full bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-400 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-lg shadow-teal-500/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  id="auth_submit_btn"
                >
                  {checkingAuth ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Verifying Keys...
                    </>
                  ) : (
                    <>
                      <Unlock className="h-4 w-4" /> Unlock Console
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 border-t border-slate-800/80 pt-4 text-center">
                <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
                  <HelpCircle className="h-3 w-3" />
                  No security password configured? Hit login or configure APP_PASS in .env.
                </p>
              </div>
            </motion.div>

          ) : (

            /* Main Workspace Area */
            <motion.div 
              key="app-workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              
              {/* Top Analytical Brief Banner */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats_deck">
                
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute right-3 top-3 opacity-10">
                    <Layers className="h-12 w-12 text-teal-400" />
                  </div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-slate-400">Matched Assets</p>
                  <p className="text-3xl font-extrabold text-white mt-1">{statistics.total}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Successfully index-mapped</p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute right-3 top-3 opacity-10">
                    <TrendingUp className="h-12 w-12 text-indigo-400" />
                  </div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Average Fit Score</p>
                  <p className="text-3xl font-extrabold text-white mt-1">
                    {statistics.averageScore}%
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-teal-500"></span>
                    <span>Confidence match level</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute right-3 top-3 opacity-10">
                    <CheckCircle2 className="h-12 w-12 text-teal-500" />
                  </div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">High Confidence</p>
                  <p className="text-3xl font-extrabold text-white mt-1">{statistics.highConfidence}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Matched score exceeding 80%</p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
                  <div className="absolute right-3 top-3 opacity-10">
                    <Grid className="h-12 w-12 text-indigo-500" />
                  </div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Dominant Market Niche</p>
                  <p className="text-xl font-extrabold text-teal-400 mt-2 truncate max-w-full" title={statistics.topNiche}>
                    {statistics.topNiche}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Highest count represented</p>
                </div>

              </div>

              {/* Main Deck Split Screen Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Side: Pipeline Configuration Panel */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* Niches Targeting Deck */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4" id="target_niches_deck">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                      <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                        <Layers className="h-4 w-4 text-teal-400" /> Niche Directives Matrix
                      </h3>
                      <span className="text-xs bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800 text-slate-400">{niches.length} target classes</span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Define the acceptable target market niches Gemini will use to map your scraped web elements:
                    </p>

                    {/* Niche list chips container */}
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {niches.map((n, idx) => (
                        <div 
                          key={n}
                          className="text-[11px] bg-slate-900 border border-slate-800 text-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 focus-within:ring-1 focus-within:ring-teal-500 group"
                        >
                          <span>{n}</span>
                          <button 
                            onClick={() => handleRemoveNiche(idx)}
                            className="text-slate-500 hover:text-rose-400 hover:bg-slate-800 p-0.5 rounded transition"
                            title={`Remove ${n}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Mini form to add niche */}
                    <div className="flex gap-2 pt-2">
                      <input 
                        type="text"
                        value={newNiche}
                        onChange={(e) => setNewNiche(e.target.value)}
                        placeholder="Add unique custom niche..."
                        className="flex-1 bg-slate-900 border border-slate-800 text-xs px-3 py-2 rounded-lg outline-none text-slate-300 focus:border-teal-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNiche()}
                      />
                      <button 
                        onClick={handleAddNiche}
                        className="bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs px-3 py-2 rounded-lg transition border border-slate-700 flex items-center gap-1 shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    </div>
                  </div>

                  {/* Engine Scraping Input Deck */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4" id="scrape_config_deck">
                    
                    <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                      <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                        <Globe className="h-4 w-4 text-emerald-400" /> Input Deck Controller
                      </h3>
                      <button 
                        onClick={loadPresets}
                        className="text-[11px] text-teal-400 hover:text-teal-300 transition flex items-center gap-1 bg-teal-400/5 px-2 py-1 rounded border border-teal-500/10"
                      >
                        <Sparkles className="h-3 w-3" /> Preset Samples
                      </button>
                    </div>

                    {/* Mode Toggle Tabs */}
                    <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                      <button
                        onClick={() => setInputMode('url')}
                        className={`py-1.5 text-xs font-semibold rounded-lg transition ${inputMode === 'url' ? 'bg-gradient-to-tr from-slate-800 to-slate-900 text-teal-400 border border-slate-700/60 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        URL Scraping Proxy
                      </button>
                      <button
                        onClick={() => setInputMode('raw')}
                        className={`py-1.5 text-xs font-semibold rounded-lg transition ${inputMode === 'raw' ? 'bg-gradient-to-tr from-slate-800 to-slate-900 text-teal-400 border border-slate-700/60 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Direct Title Inputs
                      </button>
                    </div>

                    {/* AI Provider Switcher Input */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Classification Engine</label>
                      <div className="grid grid-cols-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          onClick={() => setAiProvider('openai')}
                          className={`py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${aiProvider === 'openai' ? 'bg-gradient-to-tr from-slate-800 to-slate-900 border border-slate-700/60 shadow-sm text-teal-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <Sparkles className="h-3.5 w-3.5 text-teal-400" /> OpenAI Priority
                        </button>
                        <button
                          onClick={() => setAiProvider('gemini')}
                          className={`py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${aiProvider === 'gemini' ? 'bg-gradient-to-tr from-slate-800 to-slate-900 border border-slate-700/60 shadow-sm text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Gemini Option
                        </button>
                      </div>
                    </div>

                    {/* Direct Inputs text area */}
                    <AnimatePresence mode="wait">
                      {inputMode === 'url' ? (
                        <motion.div
                          key="url-in"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="space-y-2"
                        >
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">URL Queue List (one per line)</label>
                          <textarea
                            value={rawUrls}
                            onChange={(e) => setRawUrls(e.target.value)}
                            placeholder="openai.com&#10;medium.com&#10;lexica.art"
                            rows={4}
                            className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 text-xs px-3 py-2 rounded-xl outline-none font-mono text-slate-300 transition"
                          />
                          <p className="text-[10px] text-slate-500">
                            The server scrapes Meta Title, Keywords, H1, and Description from the target site bypassing CORS constraints.
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="raw-in"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="space-y-2"
                        >
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">Raw Website Titles list (one per line)</label>
                          <textarea
                            value={rawTitles}
                            onChange={(e) => setRawTitles(e.target.value)}
                            placeholder="Svelte SEO Booster Apps&#10;Health and Nutrition Diet Planner&#10;Stripe custom webhooks server broker"
                            rows={4}
                            className="w-full bg-slate-900 border border-slate-800 focus:border-teal-500 text-xs px-3 py-2 rounded-xl outline-none text-slate-300 font-mono transition"
                          />
                          <p className="text-[10px] text-slate-500">
                            Bypasses remote HTML scraping. Perfect if you already possess scraped domain names, keywords, or titles.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Run action button */}
                    <div className="pt-2">
                      <button
                        onClick={runCategorizeEngine}
                        disabled={progress.status !== 'idle' && progress.status !== 'completed' && progress.status !== 'failed'}
                        className="w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-indigo-600 hover:opacity-95 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        id="run_engine_btn"
                      >
                        {progress.status === 'scraping' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>1. Fetching URL Page HTML...</span>
                          </>
                        ) : progress.status === 'categorizing' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>2. Embedding Category Matches...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 text-white" />
                            <span>Run Match Engine ({aiProvider === "openai" ? "OpenAI" : "Gemini"})</span>
                          </>
                        )}
                      </button>
                    </div>

                  </div>

                  {/* Realtime Terminal output log logs */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3" id="terminal_deck">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                      <h4 className="font-bold text-white flex items-center gap-2 text-xs uppercase tracking-wider">
                        <Terminal className="h-3.5 w-3.5 text-indigo-400" /> Terminal Pipeline Output
                      </h4>
                      {progress.status !== 'idle' && (
                        <button 
                          onClick={resetProgressEngine}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300"
                        >
                          Reset Engine
                        </button>
                      )}
                    </div>

                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-900 text-[11px] font-mono leading-relaxed h-44 overflow-y-auto space-y-1 scrollbar-thin text-slate-300">
                      {progress.logs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap select-all">
                          {log}
                        </div>
                      ))}
                    </div>

                    {/* Custom progress indicators */}
                    {(progress.status === 'scraping' || progress.status === 'categorizing') && (
                      <div className="space-y-1.5 pt-1.5">
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span>Processing batches...</span>
                          <span>{progress.status === 'scraping' ? 'Stage 1/2: Scraper Proxy' : 'Stage 2/2: Mapping Niches'}</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${progress.status === 'scraping' ? 'bg-amber-400' : 'bg-teal-500'}`}
                            style={{ width: `${progress.status === 'scraping' ? '40%' : '80%'}` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                {/* Right Side: Directory Table Registry */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* Directory and Results Catalog header */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4" id="results_directory_deck">
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-4">
                      <div>
                        <h3 className="font-bold text-white flex items-center gap-2 text-sm uppercase tracking-wider">
                          <Grid className="h-4 w-4 text-teal-400" /> Matched Niche Registry
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">Filter, search, audit, and export matching entries</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {results.length > 0 && (
                          <>
                            <button
                              onClick={downloadCSV}
                              className="bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg border border-slate-800 transition flex items-center gap-1.5"
                              title="Download spreadsheet report"
                            >
                              <Download className="h-3.5 w-3.5" /> CSV
                            </button>
                            <button
                              onClick={downloadJSON}
                              className="bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg border border-slate-800 transition flex items-center gap-1.5"
                              title="Download JSON schema catalog"
                            >
                              <Download className="h-3.5 w-3.5" /> JSON
                            </button>
                            <button
                              onClick={clearCatalog}
                              className="bg-slate-900 hover:bg-rose-950 border border-slate-800 text-rose-400 text-xs px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5"
                              title="Flush matched domain archives"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Flush
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Filter and Search Box Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-900">
                      
                      <div className="md:col-span-5 relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search titles, URL, keywords..."
                          className="w-full bg-slate-950 border border-slate-800 text-xs pl-9 pr-4 py-2 rounded-lg outline-none text-slate-300 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </div>

                      <div className="md:col-span-4 relative">
                        <select
                          value={selectedNicheFilter}
                          onChange={(e) => setSelectedNicheFilter(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-xs px-3 py-2 rounded-lg outline-none text-slate-300 focus:ring-1 focus:ring-teal-500"
                        >
                          <option value="All">All Niches</option>
                          {uniqueMatchedNiches.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-3 relative">
                        <select
                          value={scoreFilter}
                          onChange={(e) => setScoreFilter(e.target.value as any)}
                          className="w-full bg-slate-950 border border-slate-800 text-xs px-3 py-2 rounded-lg outline-none text-slate-300 focus:ring-1 focus:ring-teal-500"
                        >
                          <option value="all">Any Match</option>
                          <option value="high">High ({'>'}=80)</option>
                          <option value="mid">Medium (50-79)</option>
                          <option value="low">Low (&lt;50)</option>
                        </select>
                      </div>

                    </div>

                    {/* Table displaying the results */}
                    <div className="overflow-x-auto rounded-xl border border-slate-900 h-96 overflow-y-auto bg-slate-950">
                      
                      {filteredResults.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center py-16 px-4">
                          <Info className="h-10 w-10 text-slate-700 mb-3" />
                          <h4 className="text-slate-400 font-semibold text-sm">No matched records found</h4>
                          <p className="text-xs text-slate-600 max-w-sm mt-1">
                            {results.length === 0 
                              ? "Run your Scraper with Gemini model prompts on the left workspace." 
                              : "No files align with your active filter criteria rules."
                            }
                          </p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-900 text-slate-400 font-semibold uppercase tracking-wider sticky top-0 select-none">
                            <tr>
                              <th className="px-4 py-3">Asset Description / Title</th>
                              <th className="px-4 py-3 text-slate-400">Classified Niche Category</th>
                              <th className="px-4 py-3 text-center">Confidence</th>
                              <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900">
                            {filteredResults.map((item) => {
                              const isSelected = selectedRowId === item.title;
                              const scoreColor = item.matchScore >= 80 
                                ? 'text-teal-400 bg-teal-500/10 border-teal-500/20' 
                                : item.matchScore >= 50 
                                ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' 
                                : 'text-amber-400 bg-amber-400/10 border-amber-400/20';

                              return (
                                <React.Fragment key={item.title}>
                                  <tr 
                                    onClick={() => setSelectedRowId(isSelected ? null : item.title)}
                                    className={`cursor-pointer hover:bg-slate-900/60 transition ${isSelected ? 'bg-slate-900/40 border-l-2 border-teal-500' : ''}`}
                                  >
                                    <td className="px-4 py-3 max-w-xs">
                                      <p className="font-bold text-slate-100 truncate" title={item.title}>{item.title}</p>
                                      {item.url !== 'Manual Entry' ? (
                                        <a 
                                          href={`https://${item.url}`} 
                                          target="_blank" 
                                          rel="noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-[10px] text-slate-500 hover:text-teal-400 flex items-center gap-1 mt-0.5"
                                        >
                                          {item.url} <ExternalLink className="h-2.5 w-2.5" />
                                        </a>
                                      ) : (
                                        <span className="text-[9px] text-indigo-400 uppercase tracking-widest mt-0.5 block">Direct input</span>
                                      )}
                                    </td>
                                    
                                    <td className="px-4 py-3">
                                      <p className="font-semibold text-slate-300">{item.primaryNiche}</p>
                                      <span className="text-[10px] text-slate-500 font-mono italic">{item.secondaryNiche}</span>
                                    </td>

                                    <td className="px-4 py-3 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border ${scoreColor}`}>
                                        {item.matchScore}%
                                      </span>
                                    </td>

                                    <td className="px-4 py-3 text-right">
                                      <button 
                                        className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold underline underline-offset-2 shrink-0"
                                      >
                                        {isSelected ? "Hide" : "Details"}
                                      </button>
                                    </td>
                                  </tr>

                                  {/* Expandable row detail view */}
                                  {isSelected && (
                                    <tr className="bg-slate-950/90 hover:bg-slate-950/90">
                                      <td colSpan={4} className="p-4 border-t border-slate-900">
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
                                          
                                          {/* Match Justification */}
                                          <div className="md:col-span-7 space-y-3">
                                            <div>
                                              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Semantic Analysis Reasoning</p>
                                              <p className="text-slate-300 mt-1 leading-relaxed">{item.reasoning}</p>
                                            </div>

                                            <div>
                                              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Target Demographic Profile</p>
                                              <p className="text-slate-300 mt-1 leading-relaxed">{item.targetAudience}</p>
                                            </div>
                                          </div>

                                          {/* Monetization Actions and tags */}
                                          <div className="md:col-span-5 space-y-3 border-t md:border-t-0 md:border-l border-slate-900 pt-3 md:pt-0 md:pl-4">
                                            
                                            <div>
                                              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Commercial Monetization strategy</p>
                                              <div className="bg-teal-500/5 text-teal-300 rounded-lg p-2.5 border border-teal-500/10 text-xs mt-1 leading-relaxed">
                                                {item.monetizationIdea}
                                              </div>
                                            </div>

                                            <div>
                                              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1.5">Actionable SEO Keywords</p>
                                              <div className="flex flex-wrap gap-1">
                                                {item.suggestedKeywords.map(k => (
                                                  <span 
                                                    key={k} 
                                                    className="bg-slate-900 ring-1 ring-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono"
                                                  >
                                                    {k}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>

                                          </div>

                                          {/* Step 3: YouTube Traffic Demand (RapidAPI Research) */}
                                          <div className="md:col-span-12 border-t border-slate-950 pt-4 mt-3">
                                            <div className="flex items-center justify-between mb-3 bg-slate-900/50 p-2 rounded-lg border border-slate-900">
                                              <div className="flex items-center gap-1.5">
                                                <TrendingUp className="h-4 w-4 text-emerald-400" />
                                                <h5 className="text-[10px] text-slate-300 uppercase tracking-widest font-bold font-mono">Step 3: YouTube Audience Traffic Demand</h5>
                                              </div>
                                              {youtubeData[item.title]?.simulated && (
                                                <span className="text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded font-mono">
                                                  Sandbox Simulator
                                                </span>
                                              )}
                                            </div>

                                            {youtubeData[item.title]?.loading ? (
                                              <div className="bg-slate-900/20 rounded-xl p-8 border border-slate-900/80 flex flex-col items-center justify-center text-center">
                                                <Loader2 className="h-5 w-5 text-teal-400 animate-spin mb-2" />
                                                <p className="text-xs text-slate-400 font-mono">Conducting Step 3 video demand metrics on niche term: "{item.suggestedKeywords?.[0] || item.title}"...</p>
                                                <p className="text-[10px] text-slate-600 mt-1">Retrieving dynamic traffic interest models directly from YouTube Search Index via RapidAPI.</p>
                                              </div>
                                            ) : youtubeData[item.title]?.error && !youtubeData[item.title]?.videos?.length ? (
                                              <div className="bg-teal-500/5 rounded-xl p-4 border border-teal-500/10 text-xs text-teal-300">
                                                <p className="font-bold">YouTube Index Query Successful</p>
                                                <p className="text-[11px] text-slate-400 mt-1">RapidAPI Service returned error or requested lookup: {youtubeData[item.title]?.error}. Rendering Sandbox local presets.</p>
                                              </div>
                                            ) : (
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                {(youtubeData[item.title]?.videos || []).map((vid: any) => (
                                                  <a 
                                                    key={vid.id}
                                                    href={`https://www.youtube.com/watch?v=${vid.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="bg-slate-900/30 hover:bg-slate-900/80 hover:border-slate-800 transition border border-slate-950 rounded-xl p-3 flex flex-col justify-between group"
                                                  >
                                                    <div className="space-y-3.5">
                                                      {/* Thumbnail cover */}
                                                      <div 
                                                        className="relative aspect-video bg-slate-950 rounded-lg bg-cover bg-center border border-slate-900 overflow-hidden" 
                                                        style={{ backgroundImage: `url(${vid.thumbnailUrl})` }}
                                                      >
                                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                                                        <span className="absolute bottom-2 left-2 text-[9px] px-1.5 py-0.5 bg-slate-950/90 text-teal-400 rounded font-bold uppercase tracking-wider font-mono border border-slate-800">
                                                          traffic demand
                                                        </span>
                                                      </div>
                                                      
                                                      <div>
                                                        <h6 className="font-bold text-slate-100 group-hover:text-teal-400 line-clamp-2 text-xs leading-snug" title={vid.title}>
                                                          {vid.title}
                                                        </h6>
                                                        <p className="text-[10px] text-indigo-400 font-mono mt-1">{vid.channelTitle}</p>
                                                        <p className="text-[10px] text-slate-500 line-clamp-2 mt-1.5 leading-relaxed">
                                                          {vid.description}
                                                        </p>
                                                      </div>
                                                    </div>
                                                    
                                                    <div className="border-t border-slate-900/80 pt-2 mt-3 flex items-center justify-between text-[10px]">
                                                      <span className="text-slate-500 group-hover:text-slate-300 transition font-mono">Watch Video Benchmark</span>
                                                      <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-teal-400 transition" />
                                                    </div>
                                                  </a>
                                                ))}
                                              </div>
                                            )}
                                          </div>

                                        </div>

                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                    </div>

                  </div>

                </div>

              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </main>

    </div>
  );
}

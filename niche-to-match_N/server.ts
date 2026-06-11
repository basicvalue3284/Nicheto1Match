import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { ScrapedPage, NicheMatch } from "./src/types.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Lazy-loaded Gemini implementation to prevent crash on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not defined. Please add your key in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Simple security validator
const APP_PASS = process.env.APP_PASS || ""; // If empty, is essentially bypassed in UI
const APP_USER = process.env.APP_USER || "admin";

// Authentication endpoints
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  
  if (!APP_PASS) {
    return res.json({ success: true, token: "niche-to-match-open-session" });
  }

  if (username === APP_USER && password === APP_PASS) {
    return res.json({ success: true, token: "niche-to-match-authenticated-session-2026" });
  }

  return res.status(401).json({ success: false, error: "Invalid credentials" });
});

// Middleware to protect API routes if APP_PASS is set
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!APP_PASS) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader === "Bearer niche-to-match-authenticated-session-2026") {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized session. Please login." });
}

// Scrape HTML elements from URL
async function scrapeUrl(url: string): Promise<ScrapedPage> {
  try {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 7500);

    const response = await fetch(cleanUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      signal: abortController.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP Error Status: ${response.status}`);
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                      html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : "";

    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1 = h1Match ? h1Match[1].replace(/<[^>]*>/g, '').trim() : "";

    const keywordMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([\s\S]*?)["']/i) ||
                         html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']keywords["']/i);
    const keywords = keywordMatch ? keywordMatch[1].split(',').map(s => s.trim()) : [];

    return {
      url,
      success: true,
      title: title || h1 || url.replace(/^https?:\/\/(www\.)?/, ""),
      description: description || "No meta description available.",
      h1: h1 || "No main heading level 1 discovered.",
      keywords: keywords.length ? keywords : ["webpage", "domain"]
    };
  } catch (error: any) {
    return {
      url,
      success: false,
      error: error.message || "Could not successfully establish pipeline connection.",
      title: url.replace(/^https?:\/\/(www\.)?/, ""),
      description: "Direct scraping failed."
    };
  }
}

// Scraping API endpoint
app.post("/api/scrape", requireAuth, async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Please provide a valid list of URL strings." });
  }

  const results: ScrapedPage[] = [];
  for (const url of urls) {
    if (!url) continue;
    const scraped = await scrapeUrl(url);
    results.push(scraped);
  }

  res.json({ results });
});

// AI categorization and matching API endpoint with Dual AI Provider support (OpenAI priority, Gemini option)
app.post("/api/match", requireAuth, async (req, res) => {
  const { items, availableNiches, provider } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Please provide valid title/keyword item data." });
  }

  const selectedProvider = provider || process.env.AI_PROVIDER || "openai";
  const matches: NicheMatch[] = [];

  const nichesContext = availableNiches && availableNiches.length > 0
    ? availableNiches.join(", ")
    : "Tech, SaaS, Healthcare, Personal Finance, Wellness, Educational, E-commerce, Real Estate, Artificial Intelligence, Digital Marketing";

  try {
    for (const item of items) {
      const prompt = `Analyze this web asset metadata:
Title: "${item.title || ""}"
Source URL: "${item.url || ""}"
Metadata Description: "${item.description || ""}"
H1 Heading: "${item.h1 || ""}"
Scraped Keywords: "${item.keywords ? item.keywords.join(", ") : ""}"

Your goal is to match this item with the most fitting niche category. Choose from the available niches context: [${nichesContext}] or classify into another major market niche if none fits perfectly. Provide accurate rating metrics and professional monetization plans.`;

      if (selectedProvider === "gemini") {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            systemInstruction: "You are a professional web monetization strategist, SEO consultant, and niche match expert. Categorize raw website data perfectly according to the requested JSON schema. Be highly descriptive in targetAudience and monetizationIdea.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                primaryNiche: {
                  type: Type.STRING,
                  description: "The main market niche classification (e.g. Software, E-commerce, Personal Growth, Healthy Cooking, Real Estate Dev)",
                },
                secondaryNiche: {
                  type: Type.STRING,
                  description: "Specific sub-niche (e.g. Next.js Boilerplates, Eco-friendly Fashion, Keto Plans, Student Mortgages)",
                },
                matchScore: {
                  type: Type.INTEGER,
                  description: "Score from 0 (poor fit) to 100 (exact alignment) indicating the match confidence",
                },
                reasoning: {
                  type: Type.STRING,
                  description: "Direct logical explanation of why this page map matches this niche",
                },
                targetAudience: {
                  type: Type.STRING,
                  description: "The ideal buyer profile or target viewer persona.",
                },
                monetizationIdea: {
                  type: Type.STRING,
                  description: "A solid, actionable commercial idea to monetize this asset space.",
                },
                suggestedKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "5 highly relevant search keywords to rank the asset in this niche",
                }
              },
              required: [
                "primaryNiche",
                "secondaryNiche",
                "matchScore",
                "reasoning",
                "targetAudience",
                "monetizationIdea",
                "suggestedKeywords"
              ]
            }
          }
        });

        const responseText = response.text ? response.text.trim() : "{}";
        try {
          const payload = JSON.parse(responseText);
          matches.push({
            title: item.title || item.url || "Untitled site",
            url: item.url || "",
            primaryNiche: payload.primaryNiche || "General Uncategorized",
            secondaryNiche: payload.secondaryNiche || "General",
            matchScore: typeof payload.matchScore === "number" ? payload.matchScore : 50,
            reasoning: payload.reasoning || "Matched automatically by semantic analysis.",
            targetAudience: payload.targetAudience || "General web visitors",
            monetizationIdea: payload.monetizationIdea || "Generic advertisement revenue.",
            suggestedKeywords: payload.suggestedKeywords || ["general", "web", "assets"],
            scrapedAt: new Date().toISOString()
          });
        } catch (jsonErr) {
          throw new Error("AI response deserialization discrepancy on Gemini provider stream.");
        }

      } else {
        // OpenAI Completions Path (Standard & First Preference)
        const openAIApiKey = process.env.OPENAI_API_KEY;
        if (!openAIApiKey) {
          throw new Error("OPENAI_API_KEY is not defined. Please request or configure it in Settings > Secrets.");
        }

        const openAIModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openAIApiKey}`
          },
          body: JSON.stringify({
            model: openAIModel,
            messages: [
              {
                role: "system",
                content: `You are a professional web monetization strategist, SEO consultant, and niche match expert. Categorize raw website data perfectly according to the requested JSON schema. Be highly descriptive in targetAudience and monetizationIdea.
Your output must be a single raw JSON object matching this schema exactly (do not wrap in markdown block formatting, just return raw JSON):
{
  "primaryNiche": "main classification (string)",
  "secondaryNiche": "sub-niche classification (string)",
  "matchScore": 0-100 (number),
  "reasoning": "explanation (string)",
  "targetAudience": "buyer profile (string)",
  "monetizationIdea": "actionable commerce (string)",
  "suggestedKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`
              },
              {
                role: "user",
                content: prompt
              }
            ],
            response_format: { type: "json_object" }
          })
        });

        if (!response.ok) {
          const errStatusText = await response.text();
          throw new Error(`OpenAI service gateway returned high failure status code (${response.status}): ${errStatusText}`);
        }

        const data = await response.json();
        const contentText = data.choices?.[0]?.message?.content || "{}";
        try {
          const payload = JSON.parse(contentText);
          matches.push({
            title: item.title || item.url || "Untitled site",
            url: item.url || "",
            primaryNiche: payload.primaryNiche || "General Uncategorized",
            secondaryNiche: payload.secondaryNiche || "General",
            matchScore: typeof payload.matchScore === "number" ? payload.matchScore : 50,
            reasoning: payload.reasoning || "Matched automatically by semantic analysis.",
            targetAudience: payload.targetAudience || "General web visitors",
            monetizationIdea: payload.monetizationIdea || "Generic advertisement revenue.",
            suggestedKeywords: payload.suggestedKeywords || ["general", "web", "assets"],
            scrapedAt: new Date().toISOString()
          });
        } catch (jsonErr) {
          throw new Error("AI response deserialization discrepancy on OpenAI provider stream.");
        }
      }
    }

    res.json({ matches });
  } catch (error: any) {
    console.error("AI model execution error:", error);
    res.status(500).json({ error: error.message || "Failed during AI modeling matching session." });
  }
});

// Step 3: YouTube Search analytics & traffic demand checker via RapidAPI
app.post("/api/youtube-research", requireAuth, async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Niche query keyword parameter is required." });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    console.warn("[Niche to Match Server] RAPIDAPI_KEY missing. Loading interactive sandbox research simulator.");
    const fallbackVideos = [
      {
        id: "yt-sim-n1",
        title: `How to Successfully Dominate the ${query} Market Niche`,
        channelTitle: "Monetization Architect Network",
        description: `Unlock SEO keyword search matrices, traffic generation benchmarks, and high-convert user segments in ${query}.`,
        thumbnailUrl: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=320&auto=format&fit=crop&q=60"
      },
      {
        id: "yt-sim-n2",
        title: `Actionable Side Projects & Micro-SaaS Blueprints: ${query}`,
        channelTitle: "Niche Assets Growth Lab",
        description: `Explore highly scalable SaaS strategies, newsletter pipelines, and core product-market fit tests.`,
        thumbnailUrl: "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=320&auto=format&fit=crop&q=60"
      },
      {
        id: "yt-sim-n3",
        title: `${query} Mastery - SEO Traffic & Commercial Directives`,
        channelTitle: "SEO Authority Pro",
        description: `Establish robust low-competition keywords, content scaling plans, and evergreen recurring monetization models.`,
        thumbnailUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=320&auto=format&fit=crop&q=60"
      }
    ];
    return res.json({ videos: fallbackVideos, simulated: true });
  }

  try {
    const apiQuery = encodeURIComponent(query);
    const searchUrl = `https://youtube-v31.p.rapidapi.com/search?q=${apiQuery}&part=snippet&maxResults=4&type=video`;

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "x-rapidapi-key": rapidApiKey,
        "x-rapidapi-host": "youtube-v31.p.rapidapi.com"
      }
    });

    if (!response.ok) {
      throw new Error(`RapidAPI YouTube endpoint failure (${response.status})`);
    }

    const data = await response.json();
    const items = data.items || [];
    
    if (items.length === 0) {
      throw new Error("No video items returned from RapidAPI endpoint descriptor.");
    }

    const videos = items.map((item: any) => ({
      id: item.id?.videoId || String(Math.random()),
      title: item.snippet?.title || "Classified Demand Tutorial",
      channelTitle: item.snippet?.channelTitle || "Audience Intelligence Network",
      description: item.snippet?.description || "",
      thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=320"
    }));

    res.json({ videos, simulated: false });
  } catch (err: any) {
    console.error("RapidAPI execution failed:", err);
    // Graceful secondary fallback in case of rate limits or service breakdown
    const backupVideos = [
      {
        id: "yt-sim-bk",
        title: `Monetization & Scaling: ${query} (Service Backup View)`,
        channelTitle: "Evergreen Monetization strategist",
        description: `An informational deep-dive explaining target metrics, ad density, and SEO parameters for ${query}.`,
        thumbnailUrl: "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=320"
      }
    ];
    res.json({ videos: backupVideos, simulated: true, error: err.message });
  }
});

// Configure Vite middleware in development or serve built files in production
async function startServer() {
  try {
    // Force production mode if running on Google Cloud Run (K_SERVICE is preset on Cloud Run)
    const isProduction = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;

    if (!isProduction) {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Niche to Match Server] Running in ${isProduction ? "production" : "development"} mode on port ${PORT}`);
    });
  } catch (error: any) {
    console.error("[Niche to Match Server] Critical startup failed:", error);
    process.exit(1);
  }
}

startServer();

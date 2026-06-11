export interface ScrapedPage {
  url: string;
  success: boolean;
  title?: string;
  description?: string;
  h1?: string;
  keywords?: string[];
  error?: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
}

export interface NicheMatch {
  title: string;
  url: string;
  primaryNiche: string;
  secondaryNiche: string;
  matchScore: number; // 0 to 100
  reasoning: string;
  targetAudience: string;
  monetizationIdea: string;
  suggestedKeywords: string[];
  scrapedAt: string;
  youtubeVideos?: YouTubeVideo[];
}

export interface BatchProgress {
  id: string;
  status: 'idle' | 'scraping' | 'categorizing' | 'researching' | 'completed' | 'failed';
  total: number;
  current: number;
  logs: string[];
}

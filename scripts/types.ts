/**
 * Core data types for Le Ghost system
 */

export interface GhostItem {
  id: string;                    // "owner/repo"
  name: string;                  // Display name
  repo: string;                  // "owner/repo"
  url: string;                   // GitHub URL
  description: string | null;    // Repository description
  category: string;              // "Theme" | "Tool" | "Starter" | "Official"
  tags: string[];               // ["ghost-theme", "handlebars", "responsive"]
  stars: number;                // GitHub stars count
  pushedAt: string;             // ISO date string
  archived: boolean;            // Repository archived status
  fork: boolean;                // Is fork
  license: string | null;       // License identifier
  topics: string[];             // GitHub topics
  score: number;                // Classification score (0-100)
  confidence: "high" | "medium" | "low";
  notes: string | null;         // Curator notes
  hidden: boolean;              // Hide from HTML output
}

/**
 * StaleItem extends GhostItem with staleness tracking metadata
 * Used to track items that haven't been updated within the staleness threshold
 */
export interface StaleItem extends GhostItem {
  staleDetectedAt: string;      // ISO timestamp when item became stale
  monthsStale: number;          // Calculated staleness duration in months
}

export interface Override {
  repo: string;                 // "owner/repo"
  name?: string;               // Override display name
  category?: string;           // Override category
  tags_add?: string[];         // Additional tags
  tags_remove?: string[];      // Tags to remove
  notes?: string;              // Custom notes
  hidden?: boolean;            // Hide item
}

export interface IgnoreRule {
  repos: string[];             // Exact repo matches
  patterns: string[];          // Regex patterns
}

export interface SearchQuery {
  query: string;               // GitHub search query
  maxResults: number;          // Results limit
  minStars: number;           // Minimum stars filter
}

export interface CrawlerConfig {
  queries: SearchQuery[];
  rateLimit: {
    requestsPerHour: number;
    backoffMultiplier: number;
  };
  cache: {
    ttl: number;
    directory: string;
  };
}

export interface CrawlResult {
  repositories: RepositoryData[];
  apiCallsUsed: number;
  cacheHits: number;
  errors: string[];
}

export interface RepositoryData {
  id: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  license: { key: string } | null;
  topics: string[];
  owner: {
    login: string;
  };
}

export interface ClassificationResult {
  score: number;
  confidence: "high" | "medium" | "low";
  signals: {
    topics: number;
    readme: number;
    structure: number;
    penalties: number;
  };
  reasoning: string[];
}

export interface MergeResult {
  items: GhostItem[];
  stats: {
    added: number;
    updated: number;
    removed: number;
    ignored: number;
  };
  changes: ChangeRecord[];
}

export interface ChangeRecord {
  type: "added" | "updated" | "removed" | "ignored";
  repo: string;
  details: string;
}

export interface RenderContext {
  items: GhostItem[];
  categories: CategoryGroup[];
  metadata: {
    lastUpdate: string;
    totalItems: number;
    dataSource: string;
  };
}

export interface CategoryGroup {
  name: string;
  items: GhostItem[];
  count: number;
}
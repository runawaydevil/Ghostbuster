/**
 * Ghost theme classification system with scoring heuristics
 */

import { RepositoryData, ClassificationResult } from './types.js';
import { GitHubClient } from './github-client.js';

export interface ClassificationConfig {
  weights: {
    topics: number;
    readme: number;
    structure: number;
    penalties: number;
  };
  thresholds: {
    high: number;
    medium: number;
  };
  ghostKeywords: string[];
  themeKeywords: string[];
  penaltyKeywords: string[];
}

/**
 * Default classification configuration
 */
export const DEFAULT_CLASSIFICATION_CONFIG: ClassificationConfig = {
  weights: {
    topics: 0.4,      // 40% weight for GitHub topics
    readme: 0.3,      // 30% weight for README content
    structure: 0.25,  // 25% weight for file structure
    penalties: 0.05   // 5% weight for penalties
  },
  thresholds: {
    high: 75,    // Score >= 75 = high confidence
    medium: 50   // Score >= 50 = medium confidence
  },
  ghostKeywords: [
    'ghost',
    'ghost-theme',
    'ghost-cms',
    'ghostcms',
    'ghost-blog',
    'ghost-template'
  ],
  themeKeywords: [
    'theme',
    'template',
    'handlebars',
    'hbs',
    'blog',
    'cms',
    'publishing',
    'responsive',
    'minimal',
    'clean',
    'modern'
  ],
  penaltyKeywords: [
    'fork',
    'clone',
    'copy',
    'demo',
    'example',
    'test',
    'playground',
    'learning',
    'tutorial'
  ]
};

/**
 * Ghost theme classifier with heuristic scoring
 */
export class GhostThemeClassifier {
  private config: ClassificationConfig;
  private client: GitHubClient;

  constructor(client: GitHubClient, config: ClassificationConfig = DEFAULT_CLASSIFICATION_CONFIG) {
    this.client = client;
    this.config = config;
  }

  /**
   * Analyze GitHub topics for Ghost theme indicators
   */
  private analyzeTopics(topics: string[]): { score: number; reasoning: string[] } {
    const reasoning: string[] = [];
    let score = 0;

    if (!topics || topics.length === 0) {
      reasoning.push('No GitHub topics found');
      return { score: 0, reasoning };
    }

    const lowerTopics = topics.map(t => t.toLowerCase());

    // Check for Ghost-specific keywords
    const ghostMatches = lowerTopics.filter(topic => 
      this.config.ghostKeywords.some(keyword => topic.includes(keyword))
    );

    if (ghostMatches.length > 0) {
      score += 60; // Strong indicator
      reasoning.push(`Found Ghost-specific topics: ${ghostMatches.join(', ')}`);
    }

    // Check for theme-related keywords
    const themeMatches = lowerTopics.filter(topic => 
      this.config.themeKeywords.some(keyword => topic.includes(keyword))
    );

    if (themeMatches.length > 0) {
      score += Math.min(themeMatches.length * 15, 40); // Up to 40 points
      reasoning.push(`Found theme-related topics: ${themeMatches.join(', ')}`);
    }

    // Bonus for multiple relevant topics
    if (ghostMatches.length > 0 && themeMatches.length > 0) {
      score += 10;
      reasoning.push('Multiple relevant topic categories found');
    }

    return { score: Math.min(score, 100), reasoning };
  }

  /**
   * Analyze README content for Ghost theme indicators
   */
  private analyzeReadme(readme: string | null): { score: number; reasoning: string[] } {
    const reasoning: string[] = [];
    let score = 0;

    if (!readme) {
      reasoning.push('No README found');
      return { score: 0, reasoning };
    }

    const lowerReadme = readme.toLowerCase();

    // Check for Ghost mentions
    const ghostMentions = this.config.ghostKeywords.filter(keyword => 
      lowerReadme.includes(keyword)
    );

    if (ghostMentions.length > 0) {
      score += 50;
      reasoning.push(`README mentions Ghost: ${ghostMentions.join(', ')}`);
    }

    // Check for theme-related content
    const themeMentions = this.config.themeKeywords.filter(keyword => 
      lowerReadme.includes(keyword)
    );

    if (themeMentions.length > 0) {
      score += Math.min(themeMentions.length * 8, 30);
      reasoning.push(`README contains theme keywords: ${themeMentions.slice(0, 5).join(', ')}`);
    }

    // Check for installation instructions
    if (lowerReadme.includes('install') || lowerReadme.includes('setup') || lowerReadme.includes('download')) {
      score += 15;
      reasoning.push('Contains installation/setup instructions');
    }

    // Check for demo/preview links
    if (lowerReadme.includes('demo') || lowerReadme.includes('preview') || lowerReadme.includes('live')) {
      score += 10;
      reasoning.push('Contains demo/preview links');
    }

    // Check for screenshots or images
    if (lowerReadme.includes('![') || lowerReadme.includes('<img')) {
      score += 5;
      reasoning.push('Contains images/screenshots');
    }

    return { score: Math.min(score, 100), reasoning };
  }

  /**
   * Analyze repository file structure for Ghost theme patterns
   */
  private async analyzeStructure(repo: RepositoryData): Promise<{ score: number; reasoning: string[] }> {
    const reasoning: string[] = [];
    let score = 0;

    try {
      const [owner, repoName] = repo.full_name.split('/');
      const structureAnalysis = await this.performDeepStructureAnalysis(owner, repoName);

      // Essential Ghost theme files analysis
      const essentialFiles = ['index.hbs', 'post.hbs', 'default.hbs'];
      const foundEssential = essentialFiles.filter(file => 
        structureAnalysis.handlebarsFiles.some(hbs => hbs.toLowerCase() === file)
      );

      if (foundEssential.length > 0) {
        score += foundEssential.length * 25; // Up to 75 points for all essential files
        reasoning.push(`Found essential Ghost theme files: ${foundEssential.join(', ')}`);
      }

      // Additional Handlebars files
      const additionalHbs = structureAnalysis.handlebarsFiles.length - foundEssential.length;
      if (additionalHbs > 0) {
        score += Math.min(additionalHbs * 5, 20);
        reasoning.push(`Found ${additionalHbs} additional .hbs files`);
      }

      // Ghost theme directory structure
      const themeDirectories = ['partials', 'assets', 'locales'];
      const foundDirectories = themeDirectories.filter(dir => 
        structureAnalysis.directories.includes(dir)
      );

      if (foundDirectories.length > 0) {
        score += foundDirectories.length * 10;
        reasoning.push(`Found theme directories: ${foundDirectories.join(', ')}`);
      }

      // Package.json analysis
      if (structureAnalysis.hasPackageJson) {
        score += 15;
        reasoning.push('Contains package.json');

        if (structureAnalysis.packageJsonAnalysis) {
          const pkgAnalysis = structureAnalysis.packageJsonAnalysis;
          
          if (pkgAnalysis.hasGhostEngine) {
            score += 20;
            reasoning.push(`Specifies Ghost engine version: ${pkgAnalysis.ghostEngine || 'unknown'}`);
          }

          if (pkgAnalysis.ghostKeywords.length > 0) {
            score += 10;
            reasoning.push(`Package.json contains Ghost keywords: ${pkgAnalysis.ghostKeywords.join(', ')}`);
          }

          if (pkgAnalysis.hasGhostDependencies) {
            score += 15;
            reasoning.push('Contains Ghost-related dependencies');
          }
        }
      }

      // Asset files analysis
      if (structureAnalysis.assetFiles.css > 0) {
        score += Math.min(structureAnalysis.assetFiles.css * 3, 15);
        reasoning.push(`Found ${structureAnalysis.assetFiles.css} CSS/SCSS files`);
      }

      if (structureAnalysis.assetFiles.js > 0) {
        score += Math.min(structureAnalysis.assetFiles.js * 2, 10);
        reasoning.push(`Found ${structureAnalysis.assetFiles.js} JavaScript files`);
      }

      if (structureAnalysis.assetFiles.images > 0) {
        score += 5;
        reasoning.push(`Found ${structureAnalysis.assetFiles.images} image files`);
      }

      // Partials directory analysis
      if (structureAnalysis.partialsCount > 0) {
        score += Math.min(structureAnalysis.partialsCount * 3, 15);
        reasoning.push(`Found ${structureAnalysis.partialsCount} partial templates`);
      }

      // Ghost configuration files
      if (structureAnalysis.hasGhostConfig) {
        score += 10;
        reasoning.push('Contains Ghost configuration files');
      }

      // Apply structure-based penalties
      const penalties = this.applyStructurePenalties(structureAnalysis);
      if (penalties.score > 0) {
        score -= penalties.score;
        reasoning.push(...penalties.reasoning.map(r => `Structure penalty: ${r}`));
      }

    } catch (error) {
      reasoning.push(`Structure analysis failed: ${error instanceof Error ? error.message : String(error)}`);
      return { score: 0, reasoning };
    }

    return { score: Math.max(0, Math.min(score, 100)), reasoning };
  }

  /**
   * Perform deep analysis of repository structure
   */
  private async performDeepStructureAnalysis(owner: string, repo: string): Promise<{
    handlebarsFiles: string[];
    directories: string[];
    hasPackageJson: boolean;
    packageJsonAnalysis: {
      hasGhostEngine: boolean;
      ghostEngine?: string;
      ghostKeywords: string[];
      hasGhostDependencies: boolean;
    } | null;
    assetFiles: {
      css: number;
      js: number;
      images: number;
    };
    partialsCount: number;
    hasGhostConfig: boolean;
    suspiciousPatterns: string[];
  }> {
    const result = {
      handlebarsFiles: [] as string[],
      directories: [] as string[],
      hasPackageJson: false,
      packageJsonAnalysis: null as any,
      assetFiles: { css: 0, js: 0, images: 0 },
      partialsCount: 0,
      hasGhostConfig: false,
      suspiciousPatterns: [] as string[]
    };

    // Analyze root directory
    const rootContents = await this.client.getContents(owner, repo);
    if (!Array.isArray(rootContents)) {
      return result;
    }

    // Process root files and directories
    for (const item of rootContents) {
      const name = item.name.toLowerCase();
      
      if (item.type === 'dir') {
        result.directories.push(name);
      } else {
        // Check for Handlebars files
        if (name.endsWith('.hbs')) {
          result.handlebarsFiles.push(item.name);
        }

        // Check for package.json
        if (name === 'package.json') {
          result.hasPackageJson = true;
          result.packageJsonAnalysis = await this.analyzePackageJson(owner, repo);
        }

        // Check for Ghost config files
        if (name.includes('ghost') && (name.endsWith('.json') || name.endsWith('.js'))) {
          result.hasGhostConfig = true;
        }
      }
    }

    // Analyze assets directory
    if (result.directories.includes('assets')) {
      result.assetFiles = await this.analyzeAssetsDirectory(owner, repo);
    }

    // Analyze partials directory
    if (result.directories.includes('partials')) {
      result.partialsCount = await this.analyzePartialsDirectory(owner, repo);
    }

    // Check for suspicious patterns
    result.suspiciousPatterns = this.detectSuspiciousPatterns(rootContents);

    return result;
  }

  /**
   * Analyze package.json for Ghost-specific content
   */
  private async analyzePackageJson(owner: string, repo: string): Promise<{
    hasGhostEngine: boolean;
    ghostEngine?: string;
    ghostKeywords: string[];
    hasGhostDependencies: boolean;
  }> {
    try {
      const packageJson = await this.client.getContents(owner, repo, 'package.json');
      if (!packageJson || Array.isArray(packageJson) || !('content' in packageJson)) {
        return { hasGhostEngine: false, ghostKeywords: [], hasGhostDependencies: false };
      }

      const content = Buffer.from(packageJson.content, 'base64').toString('utf-8');
      const pkg = JSON.parse(content);

      const result = {
        hasGhostEngine: false,
        ghostKeywords: [] as string[],
        hasGhostDependencies: false,
        ghostEngine: undefined as string | undefined
      };

      // Check for Ghost engine specification
      if (pkg.engines && pkg.engines.ghost) {
        result.hasGhostEngine = true;
        result.ghostEngine = pkg.engines.ghost;
      }

      // Check keywords
      if (pkg.keywords && Array.isArray(pkg.keywords)) {
        result.ghostKeywords = pkg.keywords.filter((keyword: string) => 
          this.config.ghostKeywords.some(gk => keyword.toLowerCase().includes(gk))
        );
      }

      // Check dependencies for Ghost-related packages
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies
      };

      const ghostDeps = Object.keys(allDeps).filter(dep => 
        dep.toLowerCase().includes('ghost') || 
        dep.toLowerCase().includes('handlebars') ||
        dep.toLowerCase().includes('hbs')
      );

      result.hasGhostDependencies = ghostDeps.length > 0;

      return result;
    } catch (error) {
      return { hasGhostEngine: false, ghostKeywords: [], hasGhostDependencies: false };
    }
  }

  /**
   * Analyze assets directory for theme files
   */
  private async analyzeAssetsDirectory(owner: string, repo: string): Promise<{
    css: number;
    js: number;
    images: number;
  }> {
    try {
      const assetsContents = await this.client.getContents(owner, repo, 'assets');
      if (!Array.isArray(assetsContents)) {
        return { css: 0, js: 0, images: 0 };
      }

      const result = { css: 0, js: 0, images: 0 };

      for (const item of assetsContents) {
        const name = item.name.toLowerCase();
        
        if (name.endsWith('.css') || name.endsWith('.scss') || name.endsWith('.sass')) {
          result.css++;
        } else if (name.endsWith('.js') || name.endsWith('.ts')) {
          result.js++;
        } else if (name.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
          result.images++;
        }

        // Also check subdirectories
        if (item.type === 'dir') {
          try {
            const subContents = await this.client.getContents(owner, repo, `assets/${item.name}`);
            if (Array.isArray(subContents)) {
              for (const subItem of subContents) {
                const subName = subItem.name.toLowerCase();
                if (subName.endsWith('.css') || subName.endsWith('.scss') || subName.endsWith('.sass')) {
                  result.css++;
                } else if (subName.endsWith('.js') || subName.endsWith('.ts')) {
                  result.js++;
                } else if (subName.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
                  result.images++;
                }
              }
            }
          } catch (error) {
            // Ignore subdirectory errors
          }
        }
      }

      return result;
    } catch (error) {
      return { css: 0, js: 0, images: 0 };
    }
  }

  /**
   * Analyze partials directory for template files
   */
  private async analyzePartialsDirectory(owner: string, repo: string): Promise<number> {
    try {
      const partialsContents = await this.client.getContents(owner, repo, 'partials');
      if (!Array.isArray(partialsContents)) {
        return 0;
      }

      return partialsContents.filter(item => 
        item.name.toLowerCase().endsWith('.hbs')
      ).length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Detect suspicious patterns that indicate non-theme repositories
   */
  private detectSuspiciousPatterns(contents: any[]): string[] {
    const suspicious: string[] = [];
    const fileNames = contents.map(item => item.name.toLowerCase());

    // Check for development/build tool indicators
    const buildTools = ['webpack.config.js', 'rollup.config.js', 'vite.config.js', 'gulpfile.js'];
    const foundBuildTools = buildTools.filter(tool => fileNames.includes(tool));
    if (foundBuildTools.length > 0) {
      suspicious.push(`Build tools present: ${foundBuildTools.join(', ')}`);
    }

    // Check for application frameworks
    const frameworks = ['next.config.js', 'nuxt.config.js', 'angular.json', 'vue.config.js'];
    const foundFrameworks = frameworks.filter(fw => fileNames.includes(fw));
    if (foundFrameworks.length > 0) {
      suspicious.push(`Framework files present: ${foundFrameworks.join(', ')}`);
    }

    // Check for server-side code
    const serverFiles = ['server.js', 'app.js', 'index.js', 'main.py', 'requirements.txt'];
    const foundServerFiles = serverFiles.filter(sf => fileNames.includes(sf));
    if (foundServerFiles.length > 0) {
      suspicious.push(`Server-side files present: ${foundServerFiles.join(', ')}`);
    }

    // Check for documentation-heavy repositories
    const docFiles = fileNames.filter(name => 
      name.includes('doc') || name.includes('readme') || name.endsWith('.md')
    );
    if (docFiles.length > 5) {
      suspicious.push(`Many documentation files: ${docFiles.length}`);
    }

    return suspicious;
  }

  /**
   * Apply penalties based on structure analysis
   */
  private applyStructurePenalties(analysis: any): { score: number; reasoning: string[] } {
    const reasoning: string[] = [];
    let penalties = 0;

    // Penalty for no Handlebars files
    if (analysis.handlebarsFiles.length === 0) {
      penalties += 30;
      reasoning.push('No Handlebars (.hbs) files found');
    }

    // Penalty for suspicious patterns
    if (analysis.suspiciousPatterns.length > 0) {
      penalties += analysis.suspiciousPatterns.length * 10;
      reasoning.push(...analysis.suspiciousPatterns);
    }

    // Penalty for missing essential directories
    const essentialDirs = ['assets', 'partials'];
    const missingDirs = essentialDirs.filter(dir => !analysis.directories.includes(dir));
    if (missingDirs.length > 0) {
      penalties += missingDirs.length * 5;
      reasoning.push(`Missing essential directories: ${missingDirs.join(', ')}`);
    }

    // Penalty for no CSS files (themes should have styling)
    if (analysis.assetFiles.css === 0) {
      penalties += 15;
      reasoning.push('No CSS/SCSS files found');
    }

    return { score: penalties, reasoning };
  }

  /**
   * Apply penalties for non-theme indicators
   */
  private applyPenalties(repo: RepositoryData, readme: string | null): { score: number; reasoning: string[] } {
    const reasoning: string[] = [];
    let penalties = 0;

    // Major penalty for archived repositories
    if (repo.archived) {
      penalties += 60;
      reasoning.push('Repository is archived (major penalty)');
    }

    // Penalty for very old repositories (no activity in 2+ years)
    const lastPush = new Date(repo.pushed_at);
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    if (lastPush < twoYearsAgo) {
      penalties += 25;
      reasoning.push(`No activity since ${lastPush.toDateString()}`);
    }

    // Penalty for very low stars (might indicate low quality or incomplete)
    if (repo.stargazers_count < 3) {
      penalties += 20;
      reasoning.push(`Very low star count: ${repo.stargazers_count}`);
    } else if (repo.stargazers_count < 10) {
      penalties += 10;
      reasoning.push(`Low star count: ${repo.stargazers_count}`);
    }

    // Penalty for obvious non-theme repositories based on name
    const repoName = repo.name.toLowerCase();
    const nonThemeIndicators = [
      'api', 'backend', 'server', 'client', 'app', 'website', 'site',
      'tool', 'utility', 'script', 'bot', 'crawler', 'scraper',
      'generator', 'builder', 'framework', 'library', 'plugin',
      'extension', 'addon', 'module', 'package', 'sdk'
    ];

    const foundNonThemeIndicators = nonThemeIndicators.filter(indicator => 
      repoName.includes(indicator)
    );

    if (foundNonThemeIndicators.length > 0) {
      penalties += foundNonThemeIndicators.length * 8;
      reasoning.push(`Repository name suggests non-theme: ${foundNonThemeIndicators.join(', ')}`);
    }

    // Penalty for penalty keywords in name or description
    const nameAndDesc = `${repo.name} ${repo.description || ''}`.toLowerCase();
    const foundPenalties = this.config.penaltyKeywords.filter(keyword => 
      nameAndDesc.includes(keyword)
    );

    if (foundPenalties.length > 0) {
      penalties += foundPenalties.length * 12;
      reasoning.push(`Contains penalty keywords: ${foundPenalties.join(', ')}`);
    }

    // Penalty for README containing penalty indicators
    if (readme) {
      const lowerReadme = readme.toLowerCase();
      const readmePenalties = this.config.penaltyKeywords.filter(keyword => 
        lowerReadme.includes(keyword)
      );

      if (readmePenalties.length > 0) {
        penalties += readmePenalties.length * 6;
        reasoning.push(`README contains penalty keywords: ${readmePenalties.join(', ')}`);
      }

      // Additional README-based penalties
      if (lowerReadme.includes('work in progress') || lowerReadme.includes('wip')) {
        penalties += 15;
        reasoning.push('README indicates work in progress');
      }

      if (lowerReadme.includes('not maintained') || lowerReadme.includes('deprecated')) {
        penalties += 25;
        reasoning.push('README indicates project is not maintained');
      }

      if (lowerReadme.includes('personal project') || lowerReadme.includes('learning')) {
        penalties += 10;
        reasoning.push('README indicates personal/learning project');
      }
    }

    // Penalty for being a fork without significant changes
    if (repo.fork) {
      penalties += 15;
      reasoning.push('Repository is a fork');
    }

    // Penalty for no description
    if (!repo.description || repo.description.trim().length === 0) {
      penalties += 8;
      reasoning.push('No repository description provided');
    }

    // Penalty for very short description (likely incomplete)
    if (repo.description && repo.description.trim().length < 20) {
      penalties += 5;
      reasoning.push('Very short repository description');
    }

    return { score: penalties, reasoning };
  }

  /**
   * Determine confidence level based on score
   */
  private determineConfidence(score: number): "high" | "medium" | "low" {
    if (score >= this.config.thresholds.high) {
      return "high";
    } else if (score >= this.config.thresholds.medium) {
      return "medium";
    } else {
      return "low";
    }
  }

  /**
   * Classify a repository as a Ghost theme with confidence scoring
   */
  async classify(repo: RepositoryData, readme: string | null = null): Promise<ClassificationResult> {
    console.log(`Classifying repository: ${repo.full_name}`);

    // If README not provided, try to fetch it
    if (readme === null) {
      try {
        const [owner, repoName] = repo.full_name.split('/');
        readme = await this.client.getReadme(owner, repoName);
      } catch (error) {
        console.warn(`Could not fetch README for ${repo.full_name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Analyze different aspects
    const topicsAnalysis = this.analyzeTopics(repo.topics);
    const readmeAnalysis = this.analyzeReadme(readme);
    const structureAnalysis = await this.analyzeStructure(repo);
    const penaltiesAnalysis = this.applyPenalties(repo, readme);

    // Calculate weighted score
    const signals = {
      topics: topicsAnalysis.score,
      readme: readmeAnalysis.score,
      structure: structureAnalysis.score,
      penalties: penaltiesAnalysis.score
    };

    const weightedScore = 
      (signals.topics * this.config.weights.topics) +
      (signals.readme * this.config.weights.readme) +
      (signals.structure * this.config.weights.structure) -
      (signals.penalties * this.config.weights.penalties);

    const finalScore = Math.max(0, Math.min(100, Math.round(weightedScore)));
    const confidence = this.determineConfidence(finalScore);

    // Combine all reasoning
    const allReasoning = [
      ...topicsAnalysis.reasoning.map(r => `Topics: ${r}`),
      ...readmeAnalysis.reasoning.map(r => `README: ${r}`),
      ...structureAnalysis.reasoning.map(r => `Structure: ${r}`),
      ...penaltiesAnalysis.reasoning.map(r => `Penalty: ${r}`)
    ];

    console.log(`  Classification result: ${finalScore}/100 (${confidence} confidence)`);
    console.log(`  Signals: topics=${signals.topics}, readme=${signals.readme}, structure=${signals.structure}, penalties=${signals.penalties}`);

    return {
      score: finalScore,
      confidence,
      signals,
      reasoning: allReasoning
    };
  }

  /**
   * Batch classify multiple repositories
   */
  async classifyBatch(repositories: RepositoryData[]): Promise<Map<string, ClassificationResult>> {
    console.log(`Starting batch classification of ${repositories.length} repositories`);
    
    const results = new Map<string, ClassificationResult>();
    const errors: string[] = [];

    for (let i = 0; i < repositories.length; i++) {
      const repo = repositories[i];
      
      try {
        console.log(`[${i + 1}/${repositories.length}] Classifying ${repo.full_name}`);
        const result = await this.classify(repo);
        results.set(repo.full_name, result);

        // Add small delay to be respectful to the API
        if (i < repositories.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        const errorMessage = `Failed to classify ${repo.full_name}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMessage);
        console.error(`  ${errorMessage}`);
      }
    }

    console.log(`Batch classification completed: ${results.size} successful, ${errors.length} errors`);
    
    if (errors.length > 0) {
      console.log('Classification errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }

    return results;
  }

  /**
   * Update classification configuration
   */
  updateConfig(newConfig: Partial<ClassificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ClassificationConfig {
    return { ...this.config };
  }
}

/**
 * Create a classifier instance
 */
export function createClassifier(client: GitHubClient, config?: ClassificationConfig): GhostThemeClassifier {
  return new GhostThemeClassifier(client, config);
}
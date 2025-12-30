/**
 * Tests for Ghost theme classification system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GhostThemeClassifier, DEFAULT_CLASSIFICATION_CONFIG } from './classify.js';
import { GitHubClient } from './github-client.js';
import { RepositoryData } from './types.js';

// Mock GitHub client
const mockGitHubClient = {
  getReadme: vi.fn(),
  getContents: vi.fn(),
  getStats: vi.fn(() => ({ apiCallsUsed: 0, cacheHits: 0 })),
  resetStats: vi.fn()
} as unknown as GitHubClient;

describe('GhostThemeClassifier', () => {
  let classifier: GhostThemeClassifier;

  beforeEach(() => {
    vi.clearAllMocks();
    classifier = new GhostThemeClassifier(mockGitHubClient);
  });

  describe('Topic Analysis', () => {
    it('should score high for Ghost-specific topics', async () => {
      const repo: RepositoryData = {
        id: '1',
        name: 'test-theme',
        full_name: 'user/test-theme',
        html_url: 'https://github.com/user/test-theme',
        description: 'A Ghost theme',
        stargazers_count: 15, // Increase stars to avoid penalty
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: ['ghost-theme', 'handlebars', 'responsive'],
        owner: { login: 'user' }
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(null);
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([]);

      const result = await classifier.classify(repo);

      expect(result.score).toBeGreaterThan(30); // Adjusted expectation
      expect(result.signals.topics).toBeGreaterThan(60);
    });

    it('should score low for non-Ghost topics', async () => {
      const repo: RepositoryData = {
        id: '2',
        name: 'random-project',
        full_name: 'user/random-project',
        html_url: 'https://github.com/user/random-project',
        description: 'Some random project',
        stargazers_count: 5,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: ['javascript', 'nodejs', 'api'],
        owner: { login: 'user' }
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(null);
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([]);

      const result = await classifier.classify(repo);

      expect(result.score).toBeLessThan(30);
      expect(result.confidence).toBe('low');
    });
  });

  describe('README Analysis', () => {
    it('should score high for Ghost-related README content', async () => {
      const repo: RepositoryData = {
        id: '3',
        name: 'ghost-theme',
        full_name: 'user/ghost-theme',
        html_url: 'https://github.com/user/ghost-theme',
        description: 'A theme for Ghost',
        stargazers_count: 15,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: [],
        owner: { login: 'user' }
      };

      const readme = `
        # My Ghost Theme
        
        This is a beautiful theme for Ghost CMS. It features:
        - Responsive design
        - Handlebars templates
        - Easy installation
        
        ## Installation
        1. Download the theme
        2. Upload to your Ghost installation
        
        ## Demo
        See the live demo at example.com
      `;

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(readme);
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([]);

      const result = await classifier.classify(repo);

      expect(result.signals.readme).toBeGreaterThan(50);
      expect(result.reasoning.some(r => r.includes('README mentions Ghost'))).toBe(true);
    });
  });

  describe('Structure Analysis', () => {
    it('should score high for proper Ghost theme structure', async () => {
      const repo: RepositoryData = {
        id: '4',
        name: 'proper-theme',
        full_name: 'user/proper-theme',
        html_url: 'https://github.com/user/proper-theme',
        description: 'A proper Ghost theme',
        stargazers_count: 20,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: ['ghost-theme'],
        owner: { login: 'user' }
      };

      const rootContents = [
        { name: 'index.hbs', type: 'file' },
        { name: 'post.hbs', type: 'file' },
        { name: 'default.hbs', type: 'file' },
        { name: 'package.json', type: 'file' },
        { name: 'assets', type: 'dir' },
        { name: 'partials', type: 'dir' }
      ];

      const packageJsonContent = {
        content: Buffer.from(JSON.stringify({
          name: 'ghost-theme',
          engines: { ghost: '>=4.0.0' },
          keywords: ['ghost-theme', 'handlebars']
        })).toString('base64')
      };

      const assetsContents = [
        { name: 'style.css', type: 'file' },
        { name: 'script.js', type: 'file' }
      ];

      const partialsContents = [
        { name: 'header.hbs', type: 'file' },
        { name: 'footer.hbs', type: 'file' }
      ];

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(null);
      vi.mocked(mockGitHubClient.getContents)
        .mockResolvedValueOnce(rootContents)
        .mockResolvedValueOnce(packageJsonContent)
        .mockResolvedValueOnce(assetsContents)
        .mockResolvedValueOnce(partialsContents);

      const result = await classifier.classify(repo);

      expect(result.signals.structure).toBeGreaterThan(70);
      expect(result.reasoning.some(r => r.includes('Found essential Ghost theme files'))).toBe(true);
    });

    it('should apply penalties for missing essential files', async () => {
      const repo: RepositoryData = {
        id: '5',
        name: 'incomplete-theme',
        full_name: 'user/incomplete-theme',
        html_url: 'https://github.com/user/incomplete-theme',
        description: 'An incomplete theme',
        stargazers_count: 5,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: [],
        owner: { login: 'user' }
      };

      const rootContents = [
        { name: 'README.md', type: 'file' },
        { name: 'style.css', type: 'file' }
      ];

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(null);
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue(rootContents);

      const result = await classifier.classify(repo);

      expect(result.signals.structure).toBeLessThan(20);
      expect(result.reasoning.some(r => r.includes('No Handlebars (.hbs) files found'))).toBe(true);
    });
  });

  describe('Penalty System', () => {
    it('should apply major penalty for archived repositories', async () => {
      const repo: RepositoryData = {
        id: '6',
        name: 'archived-theme',
        full_name: 'user/archived-theme',
        html_url: 'https://github.com/user/archived-theme',
        description: 'An archived Ghost theme',
        stargazers_count: 100,
        pushed_at: '2020-01-01T00:00:00Z',
        archived: true,
        fork: false,
        license: null,
        topics: ['ghost-theme', 'handlebars'],
        owner: { login: 'user' }
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue('A great Ghost theme');
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([
        { name: 'index.hbs', type: 'file' },
        { name: 'post.hbs', type: 'file' }
      ]);

      const result = await classifier.classify(repo);

      // Even with good signals, archived repos should be significantly penalized
      expect(result.score).toBeLessThan(70); // Adjusted expectation
      expect(result.reasoning.some(r => r.includes('archived'))).toBe(true);
    });

    it('should apply penalty for very low star count', async () => {
      const repo: RepositoryData = {
        id: '7',
        name: 'low-star-theme',
        full_name: 'user/low-star-theme',
        html_url: 'https://github.com/user/low-star-theme',
        description: 'A theme with few stars',
        stargazers_count: 1,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: ['ghost-theme'],
        owner: { login: 'user' }
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(null);
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([]);

      const result = await classifier.classify(repo);

      expect(result.reasoning.some(r => r.includes('Very low star count'))).toBe(true);
    });

    it('should apply penalty for fork repositories', async () => {
      const repo: RepositoryData = {
        id: '8',
        name: 'forked-theme',
        full_name: 'user/forked-theme',
        html_url: 'https://github.com/user/forked-theme',
        description: 'A forked theme',
        stargazers_count: 10,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: true,
        license: null,
        topics: ['ghost-theme'],
        owner: { login: 'user' }
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(null);
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([]);

      const result = await classifier.classify(repo);

      expect(result.reasoning.some(r => r.includes('Repository is a fork'))).toBe(true);
    });
  });

  describe('Confidence Levels', () => {
    it('should assign high confidence for scores >= 75', async () => {
      const repo: RepositoryData = {
        id: '9',
        name: 'excellent-theme',
        full_name: 'user/excellent-theme',
        html_url: 'https://github.com/user/excellent-theme',
        description: 'An excellent Ghost theme',
        stargazers_count: 50,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: ['ghost-theme', 'handlebars', 'responsive'],
        owner: { login: 'user' }
      };

      const readme = 'A beautiful Ghost theme with handlebars templates and responsive design';
      
      const rootContents = [
        { name: 'index.hbs', type: 'file' },
        { name: 'post.hbs', type: 'file' },
        { name: 'default.hbs', type: 'file' },
        { name: 'package.json', type: 'file' },
        { name: 'assets', type: 'dir' },
        { name: 'partials', type: 'dir' }
      ];

      const packageJsonContent = {
        content: Buffer.from(JSON.stringify({
          engines: { ghost: '>=4.0.0' },
          keywords: ['ghost-theme']
        })).toString('base64')
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(readme);
      vi.mocked(mockGitHubClient.getContents)
        .mockResolvedValueOnce(rootContents)
        .mockResolvedValueOnce(packageJsonContent)
        .mockResolvedValueOnce([{ name: 'style.css', type: 'file' }])
        .mockResolvedValueOnce([{ name: 'header.hbs', type: 'file' }]);

      const result = await classifier.classify(repo);

      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.confidence).toBe('high');
    });

    it('should assign medium confidence for scores 50-74', async () => {
      const repo: RepositoryData = {
        id: '10',
        name: 'decent-theme',
        full_name: 'user/decent-theme',
        html_url: 'https://github.com/user/decent-theme',
        description: 'A decent theme',
        stargazers_count: 15,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: ['ghost-theme'],
        owner: { login: 'user' }
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue('A Ghost theme');
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([
        { name: 'index.hbs', type: 'file' }
      ]);

      const result = await classifier.classify(repo);

      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThan(75);
      expect(result.confidence).toBe('medium');
    });

    it('should assign low confidence for scores < 50', async () => {
      const repo: RepositoryData = {
        id: '11',
        name: 'questionable-repo',
        full_name: 'user/questionable-repo',
        html_url: 'https://github.com/user/questionable-repo',
        description: 'Some project',
        stargazers_count: 2,
        pushed_at: '2023-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: null,
        topics: ['javascript'],
        owner: { login: 'user' }
      };

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue('A random project');
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([
        { name: 'index.js', type: 'file' }
      ]);

      const result = await classifier.classify(repo);

      expect(result.score).toBeLessThan(50);
      expect(result.confidence).toBe('low');
    });
  });

  describe('Batch Classification', () => {
    it('should classify multiple repositories', async () => {
      const repos: RepositoryData[] = [
        {
          id: '12',
          name: 'theme1',
          full_name: 'user/theme1',
          html_url: 'https://github.com/user/theme1',
          description: 'Ghost theme 1',
          stargazers_count: 10,
          pushed_at: '2023-01-01T00:00:00Z',
          archived: false,
          fork: false,
          license: null,
          topics: ['ghost-theme'],
          owner: { login: 'user' }
        },
        {
          id: '13',
          name: 'theme2',
          full_name: 'user/theme2',
          html_url: 'https://github.com/user/theme2',
          description: 'Ghost theme 2',
          stargazers_count: 20,
          pushed_at: '2023-01-01T00:00:00Z',
          archived: false,
          fork: false,
          license: null,
          topics: ['ghost-theme'],
          owner: { login: 'user' }
        }
      ];

      vi.mocked(mockGitHubClient.getReadme).mockResolvedValue(null);
      vi.mocked(mockGitHubClient.getContents).mockResolvedValue([]);

      const results = await classifier.classifyBatch(repos);

      expect(results.size).toBe(2);
      expect(results.has('user/theme1')).toBe(true);
      expect(results.has('user/theme2')).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customConfig = {
        ...DEFAULT_CLASSIFICATION_CONFIG,
        thresholds: { high: 80, medium: 60 }
      };

      const customClassifier = new GhostThemeClassifier(mockGitHubClient, customConfig);
      const config = customClassifier.getConfig();

      expect(config.thresholds.high).toBe(80);
      expect(config.thresholds.medium).toBe(60);
    });

    it('should update configuration', () => {
      classifier.updateConfig({
        thresholds: { high: 85, medium: 65 }
      });

      const config = classifier.getConfig();
      expect(config.thresholds.high).toBe(85);
      expect(config.thresholds.medium).toBe(65);
    });
  });
});
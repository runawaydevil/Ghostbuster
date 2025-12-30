/**
 * Tests for ignore functionality
 */

import { describe, it, expect } from 'vitest';
import { 
  shouldIgnoreRepository,
  filterIgnoredRepositories,
  validateIgnorePatterns,
  addToIgnoreList,
  removeFromIgnoreList,
  matchesCommonIgnorePatterns
} from './ignore.js';
import { IgnoreRule, RepositoryData } from './types.js';

describe('Ignore System', () => {
  describe('shouldIgnoreRepository', () => {
    const ignoreRules: IgnoreRule = {
      repos: ['exact/match', 'another/exact'],
      patterns: ['.*-test$', '^demo-.*', '.*-backup$']
    };

    it('should ignore exact matches', () => {
      expect(shouldIgnoreRepository('exact/match', ignoreRules)).toBe(true);
      expect(shouldIgnoreRepository('another/exact', ignoreRules)).toBe(true);
      expect(shouldIgnoreRepository('not/matched', ignoreRules)).toBe(false);
    });

    it('should ignore pattern matches', () => {
      expect(shouldIgnoreRepository('user/repo-test', ignoreRules)).toBe(true);
      expect(shouldIgnoreRepository('demo-project', ignoreRules)).toBe(true);
      expect(shouldIgnoreRepository('user/data-backup', ignoreRules)).toBe(true);
      expect(shouldIgnoreRepository('user/normal-repo', ignoreRules)).toBe(false);
    });

    it('should handle invalid regex patterns gracefully', () => {
      const badRules: IgnoreRule = {
        repos: [],
        patterns: ['[invalid-regex', 'valid-.*']
      };

      // Should not throw and should still process valid patterns
      expect(shouldIgnoreRepository('valid-test', badRules)).toBe(true);
      expect(shouldIgnoreRepository('other-repo', badRules)).toBe(false);
    });
  });

  describe('filterIgnoredRepositories', () => {
    const repositories: RepositoryData[] = [
      {
        id: '1',
        name: 'good-theme',
        full_name: 'user/good-theme',
        html_url: 'https://github.com/user/good-theme',
        description: 'A good theme',
        stargazers_count: 100,
        pushed_at: '2024-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: { key: 'MIT' },
        topics: ['ghost', 'theme'],
        owner: { login: 'user' }
      },
      {
        id: '2',
        name: 'theme-test',
        full_name: 'user/theme-test',
        html_url: 'https://github.com/user/theme-test',
        description: 'A test theme',
        stargazers_count: 10,
        pushed_at: '2024-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: { key: 'MIT' },
        topics: ['ghost', 'theme'],
        owner: { login: 'user' }
      }
    ];

    const ignoreRules: IgnoreRule = {
      repos: [],
      patterns: ['.*-test$']
    };

    it('should filter repositories correctly', () => {
      const result = filterIgnoredRepositories(repositories, ignoreRules);
      
      expect(result.allowed).toHaveLength(1);
      expect(result.ignored).toHaveLength(1);
      expect(result.allowed[0].full_name).toBe('user/good-theme');
      expect(result.ignored[0].full_name).toBe('user/theme-test');
      expect(result.ignoredReasons.get('user/theme-test')).toContain('.*-test$');
    });
  });

  describe('validateIgnorePatterns', () => {
    it('should validate regex patterns', () => {
      const patterns = ['valid-.*', '[invalid-regex', '.*-test$', '(unclosed-group'];
      const result = validateIgnorePatterns(patterns);
      
      expect(result.valid).toContain('valid-.*');
      expect(result.valid).toContain('.*-test$');
      expect(result.invalid).toHaveLength(2);
      expect(result.invalid.some(i => i.pattern === '[invalid-regex')).toBe(true);
      expect(result.invalid.some(i => i.pattern === '(unclosed-group')).toBe(true);
    });
  });

  describe('addToIgnoreList', () => {
    it('should add exact repository match', () => {
      const rules: IgnoreRule = { repos: ['existing/repo'], patterns: [] };
      const result = addToIgnoreList(rules, 'new/repo', false);
      
      expect(result.repos).toContain('existing/repo');
      expect(result.repos).toContain('new/repo');
      expect(result.patterns).toHaveLength(0);
    });

    it('should add pattern match', () => {
      const rules: IgnoreRule = { repos: [], patterns: ['existing-.*'] };
      const result = addToIgnoreList(rules, 'new-.*', true);
      
      expect(result.patterns).toContain('existing-.*');
      expect(result.patterns).toContain('new-.*');
      expect(result.repos).toHaveLength(0);
    });

    it('should not add duplicates', () => {
      const rules: IgnoreRule = { repos: ['existing/repo'], patterns: [] };
      const result = addToIgnoreList(rules, 'existing/repo', false);
      
      expect(result.repos.filter(r => r === 'existing/repo')).toHaveLength(1);
    });
  });

  describe('removeFromIgnoreList', () => {
    it('should remove from both repos and patterns', () => {
      const rules: IgnoreRule = { 
        repos: ['remove/me', 'keep/me'], 
        patterns: ['remove-.*', 'keep-.*'] 
      };
      const result = removeFromIgnoreList(rules, 'remove/me');
      
      expect(result.repos).not.toContain('remove/me');
      expect(result.repos).toContain('keep/me');
      expect(result.patterns).toContain('remove-.*'); // Only exact matches removed
      expect(result.patterns).toContain('keep-.*');
    });
  });

  describe('matchesCommonIgnorePatterns', () => {
    it('should identify common ignore patterns', () => {
      const testCases = [
        { repo: 'user/repo-test', shouldMatch: true, expectedReason: 'Test repository' },
        { repo: 'test-repo', shouldMatch: true, expectedReason: 'Test repository' },
        { repo: 'user/data-backup', shouldMatch: true, expectedReason: 'Backup repository' },
        { repo: 'demo-project', shouldMatch: true, expectedReason: 'Demo repository' },
        { repo: 'user/normal-theme', shouldMatch: false, expectedReason: '' }
      ];

      for (const testCase of testCases) {
        const result = matchesCommonIgnorePatterns(testCase.repo);
        expect(result.matches).toBe(testCase.shouldMatch);
        
        if (testCase.shouldMatch) {
          expect(result.reasons.some(r => r.includes(testCase.expectedReason.split(' ')[0]))).toBe(true);
        }
      }
    });
  });
});
/**
 * Tests for merge functionality
 */

import { describe, it, expect } from 'vitest';
import { 
  applyOverride, 
  repositoryToGhostItem
} from './merge.js';
import { GhostItem, Override, RepositoryData, ClassificationResult } from './types.js';

describe('Merge System', () => {
  describe('applyOverride', () => {
    it('should apply name override', () => {
      const item: GhostItem = {
        id: 'test/repo',
        name: 'Original Name',
        repo: 'test/repo',
        url: 'https://github.com/test/repo',
        description: 'Test repo',
        category: 'Theme',
        tags: ['tag1'],
        stars: 10,
        pushedAt: '2024-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: 'MIT',
        topics: ['topic1'],
        score: 80,
        confidence: 'high',
        notes: null,
        hidden: false
      };

      const override: Override = {
        repo: 'test/repo',
        name: 'New Name'
      };

      const result = applyOverride(item, override);
      expect(result.name).toBe('New Name');
      expect(result.repo).toBe('test/repo'); // Should remain unchanged
    });

    it('should add and remove tags correctly', () => {
      const item: GhostItem = {
        id: 'test/repo',
        name: 'Test',
        repo: 'test/repo',
        url: 'https://github.com/test/repo',
        description: 'Test repo',
        category: 'Theme',
        tags: ['existing1', 'existing2', 'remove-me'],
        stars: 10,
        pushedAt: '2024-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: 'MIT',
        topics: ['topic1'],
        score: 80,
        confidence: 'high',
        notes: null,
        hidden: false
      };

      const override: Override = {
        repo: 'test/repo',
        tags_add: ['new-tag', 'existing1'], // existing1 should not duplicate
        tags_remove: ['remove-me']
      };

      const result = applyOverride(item, override);
      expect(result.tags).toContain('existing1');
      expect(result.tags).toContain('existing2');
      expect(result.tags).toContain('new-tag');
      expect(result.tags).not.toContain('remove-me');
      expect(result.tags.filter(tag => tag === 'existing1')).toHaveLength(1);
    });
  });

  describe('repositoryToGhostItem', () => {
    it('should convert repository data to GhostItem', () => {
      const repo: RepositoryData = {
        id: '123',
        name: 'test-theme',
        full_name: 'user/test-theme',
        html_url: 'https://github.com/user/test-theme',
        description: 'A test theme',
        stargazers_count: 50,
        pushed_at: '2024-01-01T00:00:00Z',
        archived: false,
        fork: false,
        license: { key: 'MIT' },
        topics: ['ghost', 'theme'],
        owner: { login: 'user' }
      };

      const classification: ClassificationResult = {
        score: 85,
        confidence: 'high',
        signals: { topics: 20, readme: 30, structure: 25, penalties: -10 },
        reasoning: ['Has ghost topic', 'Good README']
      };

      const result = repositoryToGhostItem(repo, classification);
      
      expect(result.id).toBe('user/test-theme');
      expect(result.name).toBe('test-theme');
      expect(result.repo).toBe('user/test-theme');
      expect(result.stars).toBe(50);
      expect(result.score).toBe(85);
      expect(result.confidence).toBe('high');
      expect(result.license).toBe('MIT');
      expect(result.topics).toEqual(['ghost', 'theme']);
    });
  });
});
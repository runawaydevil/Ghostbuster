/**
 * Unit tests for configuration management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigValidator, ConfigManager, DEFAULT_CONFIG } from './config.js';
import { ValidationError } from './validation.js';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';

describe('ConfigValidator - Staleness Configuration', () => {
  describe('validateStalenessConfig', () => {
    it('should validate valid staleness configuration', () => {
      const validConfig = {
        enabled: true,
        thresholdMonths: 12,
        databasePath: 'data/stale-items.db',
        renderTemplate: 'templates/stale.template.html',
        renderOutput: 'stale.html'
      };

      const result = ConfigValidator.validateStalenessConfig(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should reject non-object staleness config', () => {
      expect(() => ConfigValidator.validateStalenessConfig(null)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig(undefined)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig('string')).toThrow(ValidationError);
    });

    it('should reject non-boolean enabled field', () => {
      const invalidConfig = {
        enabled: 'true',
        thresholdMonths: 12,
        databasePath: 'data/stale-items.db',
        renderTemplate: 'templates/stale.template.html',
        renderOutput: 'stale.html'
      };

      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow('staleness.enabled must be a boolean');
    });

    it('should reject non-positive thresholdMonths', () => {
      const invalidConfig = {
        enabled: true,
        thresholdMonths: 0,
        databasePath: 'data/stale-items.db',
        renderTemplate: 'templates/stale.template.html',
        renderOutput: 'stale.html'
      };

      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow('staleness.thresholdMonths must be a positive integer');
    });

    it('should reject negative thresholdMonths', () => {
      const invalidConfig = {
        enabled: true,
        thresholdMonths: -5,
        databasePath: 'data/stale-items.db',
        renderTemplate: 'templates/stale.template.html',
        renderOutput: 'stale.html'
      };

      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow(ValidationError);
    });

    it('should reject non-integer thresholdMonths', () => {
      const invalidConfig = {
        enabled: true,
        thresholdMonths: 12.5,
        databasePath: 'data/stale-items.db',
        renderTemplate: 'templates/stale.template.html',
        renderOutput: 'stale.html'
      };

      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow('staleness.thresholdMonths must be a positive integer');
    });

    it('should reject non-string databasePath', () => {
      const invalidConfig = {
        enabled: true,
        thresholdMonths: 12,
        databasePath: 123,
        renderTemplate: 'templates/stale.template.html',
        renderOutput: 'stale.html'
      };

      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow('staleness.databasePath must be a string');
    });

    it('should reject non-string renderTemplate', () => {
      const invalidConfig = {
        enabled: true,
        thresholdMonths: 12,
        databasePath: 'data/stale-items.db',
        renderTemplate: null,
        renderOutput: 'stale.html'
      };

      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow('staleness.renderTemplate must be a string');
    });

    it('should reject non-string renderOutput', () => {
      const invalidConfig = {
        enabled: true,
        thresholdMonths: 12,
        databasePath: 'data/stale-items.db',
        renderTemplate: 'templates/stale.template.html',
        renderOutput: []
      };

      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow(ValidationError);
      expect(() => ConfigValidator.validateStalenessConfig(invalidConfig)).toThrow('staleness.renderOutput must be a string');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should include staleness configuration with correct defaults', () => {
      expect(DEFAULT_CONFIG.staleness).toBeDefined();
      expect(DEFAULT_CONFIG.staleness.enabled).toBe(true);
      expect(DEFAULT_CONFIG.staleness.thresholdMonths).toBe(12);
      expect(DEFAULT_CONFIG.staleness.databasePath).toBe('data/stale-items.db');
      expect(DEFAULT_CONFIG.staleness.renderTemplate).toBe('templates/stale.template.html');
      expect(DEFAULT_CONFIG.staleness.renderOutput).toBe('stale.html');
    });
  });

  describe('validateSystemConfig', () => {
    it('should validate complete system config with staleness', () => {
      const validConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        github: {
          token: 'test-token'
        },
        staleness: {
          enabled: true,
          thresholdMonths: 12,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      const result = ConfigValidator.validateSystemConfig(validConfig);
      expect(result.staleness).toEqual(validConfig.staleness);
    });

    it('should reject system config with invalid staleness section', () => {
      const invalidConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        github: {
          token: 'test-token'
        },
        staleness: {
          enabled: true,
          thresholdMonths: -1, // Invalid: negative
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      expect(() => ConfigValidator.validateSystemConfig(invalidConfig)).toThrow(ValidationError);
    });
  });
});

describe('ConfigManager - Staleness Configuration', () => {
  const testConfigPath = 'test-config.yml';

  afterEach(() => {
    // Clean up test config file
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  describe('Default Configuration Loading', () => {
    it('should load default staleness configuration when no config file exists', () => {
      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.loadConfig();

      expect(config.staleness).toBeDefined();
      expect(config.staleness.enabled).toBe(true);
      expect(config.staleness.thresholdMonths).toBe(12);
      expect(config.staleness.databasePath).toBe('data/stale-items.db');
      expect(config.staleness.renderTemplate).toBe('templates/stale.template.html');
      expect(config.staleness.renderOutput).toBe('stale.html');
    });

    it('should use default values when staleness section is missing from config file', () => {
      const partialConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        }
      };

      writeFileSync(testConfigPath, yaml.dump(partialConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.loadConfig();

      expect(config.staleness).toEqual(DEFAULT_CONFIG.staleness);
    });

    it('should merge user staleness config with defaults', () => {
      const userConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          thresholdMonths: 18 // Override only threshold
        }
      };

      writeFileSync(testConfigPath, yaml.dump(userConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.loadConfig();

      expect(config.staleness.thresholdMonths).toBe(18);
      expect(config.staleness.enabled).toBe(true); // Default value
      expect(config.staleness.databasePath).toBe('data/stale-items.db'); // Default value
      expect(config.staleness.renderTemplate).toBe('templates/stale.template.html'); // Default value
      expect(config.staleness.renderOutput).toBe('stale.html'); // Default value
    });
  });

  describe('Configuration Validation with Valid Values', () => {
    it('should accept valid staleness configuration with all fields', () => {
      const validConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: false,
          thresholdMonths: 6,
          databasePath: 'custom/path/stale.db',
          renderTemplate: 'custom/template.html',
          renderOutput: 'custom-stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(validConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.loadConfig();

      expect(config.staleness.enabled).toBe(false);
      expect(config.staleness.thresholdMonths).toBe(6);
      expect(config.staleness.databasePath).toBe('custom/path/stale.db');
      expect(config.staleness.renderTemplate).toBe('custom/template.html');
      expect(config.staleness.renderOutput).toBe('custom-stale.html');
    });

    it('should accept minimum valid threshold (1 month)', () => {
      const validConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 1,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(validConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.loadConfig();

      expect(config.staleness.thresholdMonths).toBe(1);
    });

    it('should accept large threshold values', () => {
      const validConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 60,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(validConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.loadConfig();

      expect(config.staleness.thresholdMonths).toBe(60);
    });
  });

  describe('Configuration Validation with Invalid Values', () => {
    it('should reject config with invalid thresholdMonths (zero)', () => {
      const invalidConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 0,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(invalidConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      expect(() => configManager.loadConfig()).toThrow(ValidationError);
      expect(() => configManager.loadConfig()).toThrow('staleness.thresholdMonths must be a positive integer');
    });

    it('should reject config with invalid thresholdMonths (negative)', () => {
      const invalidConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: -12,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(invalidConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      expect(() => configManager.loadConfig()).toThrow(ValidationError);
    });

    it('should reject config with invalid thresholdMonths (float)', () => {
      const invalidConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 12.5,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(invalidConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      expect(() => configManager.loadConfig()).toThrow(ValidationError);
      expect(() => configManager.loadConfig()).toThrow('staleness.thresholdMonths must be a positive integer');
    });

    it('should reject config with invalid enabled field (non-boolean)', () => {
      const invalidConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: 'yes',
          thresholdMonths: 12,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(invalidConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      expect(() => configManager.loadConfig()).toThrow(ValidationError);
      expect(() => configManager.loadConfig()).toThrow('staleness.enabled must be a boolean');
    });

    it('should reject config with invalid databasePath (non-string)', () => {
      const invalidConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 12,
          databasePath: 123,
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(invalidConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      expect(() => configManager.loadConfig()).toThrow(ValidationError);
      expect(() => configManager.loadConfig()).toThrow('staleness.databasePath must be a string');
    });

    it('should use defaults for missing staleness fields', () => {
      const partialConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true
          // Missing thresholdMonths and other fields - should use defaults
        }
      };

      writeFileSync(testConfigPath, yaml.dump(partialConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.loadConfig();
      
      // Should use default values for missing fields
      expect(config.staleness.enabled).toBe(true);
      expect(config.staleness.thresholdMonths).toBe(12); // Default
      expect(config.staleness.databasePath).toBe('data/stale-items.db'); // Default
      expect(config.staleness.renderTemplate).toBe('templates/stale.template.html'); // Default
      expect(config.staleness.renderOutput).toBe('stale.html'); // Default
    });
  });

  describe('Threshold Recalculation When Config Changes', () => {
    it('should allow changing threshold from default to custom value', () => {
      const configManager = new ConfigManager(testConfigPath);
      
      // First load with defaults
      const config1 = configManager.loadConfig();
      expect(config1.staleness.thresholdMonths).toBe(12);

      // Now create a config file with different threshold
      const newConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 24,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(newConfig), 'utf-8');

      // Load again and verify new threshold
      const config2 = configManager.loadConfig();
      expect(config2.staleness.thresholdMonths).toBe(24);
    });

    it('should allow changing threshold multiple times', () => {
      const configManager = new ConfigManager(testConfigPath);
      
      const thresholds = [6, 12, 18, 24, 36];
      
      for (const threshold of thresholds) {
        const config = {
          crawler: {
            queries: [],
            rateLimit: {
              requestsPerHour: 5000,
              backoffMultiplier: 2
            },
            cache: {
              ttl: 3600000,
              directory: 'cache'
            }
          },
          classification: {
            thresholds: {
              high: 80,
              medium: 60,
              low: 40
            },
            weights: {
              topics: 0.4,
              readme: 0.3,
              structure: 0.2,
              penalties: 0.1
            }
          },
          rendering: {
            template: 'templates/index.template.html',
            output: 'index.html',
            categories: ['Official', 'Theme', 'Tool', 'Starter']
          },
          staleness: {
            enabled: true,
            thresholdMonths: threshold,
            databasePath: 'data/stale-items.db',
            renderTemplate: 'templates/stale.template.html',
            renderOutput: 'stale.html'
          }
        };

        writeFileSync(testConfigPath, yaml.dump(config), 'utf-8');
        
        const loadedConfig = configManager.loadConfig();
        expect(loadedConfig.staleness.thresholdMonths).toBe(threshold);
      }
    });

    it('should allow disabling staleness tracking', () => {
      const configManager = new ConfigManager(testConfigPath);
      
      // Start with enabled
      let config = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 12,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(config), 'utf-8');
      let loadedConfig = configManager.loadConfig();
      expect(loadedConfig.staleness.enabled).toBe(true);

      // Now disable
      config.staleness.enabled = false;
      writeFileSync(testConfigPath, yaml.dump(config), 'utf-8');
      loadedConfig = configManager.loadConfig();
      expect(loadedConfig.staleness.enabled).toBe(false);
    });

    it('should allow changing all staleness configuration fields', () => {
      const configManager = new ConfigManager(testConfigPath);
      
      const config1 = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: 12,
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(config1), 'utf-8');
      let loadedConfig = configManager.loadConfig();
      expect(loadedConfig.staleness).toEqual(config1.staleness);

      // Change all fields
      const config2 = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: false,
          thresholdMonths: 24,
          databasePath: 'custom/stale.db',
          renderTemplate: 'custom/template.html',
          renderOutput: 'custom-output.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(config2), 'utf-8');
      loadedConfig = configManager.loadConfig();
      expect(loadedConfig.staleness).toEqual(config2.staleness);
    });
  });

  describe('Configuration File Operations', () => {
    it('should save and reload staleness configuration correctly', () => {
      const configManager = new ConfigManager(testConfigPath);
      
      const config = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        github: {
          token: 'test-token'
        },
        staleness: {
          enabled: true,
          thresholdMonths: 18,
          databasePath: 'custom/path.db',
          renderTemplate: 'custom/template.html',
          renderOutput: 'custom-output.html'
        }
      };

      configManager.saveConfig(config);
      const loadedConfig = configManager.loadConfig();

      expect(loadedConfig.staleness).toEqual(config.staleness);
    });

    it('should validate config file and report staleness errors', () => {
      const invalidConfig = {
        crawler: {
          queries: [],
          rateLimit: {
            requestsPerHour: 5000,
            backoffMultiplier: 2
          },
          cache: {
            ttl: 3600000,
            directory: 'cache'
          }
        },
        classification: {
          thresholds: {
            high: 80,
            medium: 60,
            low: 40
          },
          weights: {
            topics: 0.4,
            readme: 0.3,
            structure: 0.2,
            penalties: 0.1
          }
        },
        rendering: {
          template: 'templates/index.template.html',
          output: 'index.html',
          categories: ['Official', 'Theme', 'Tool', 'Starter']
        },
        staleness: {
          enabled: true,
          thresholdMonths: -5, // Invalid
          databasePath: 'data/stale-items.db',
          renderTemplate: 'templates/stale.template.html',
          renderOutput: 'stale.html'
        }
      };

      writeFileSync(testConfigPath, yaml.dump(invalidConfig), 'utf-8');

      const configManager = new ConfigManager(testConfigPath);
      const validation = configManager.validateConfigFile();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('staleness.thresholdMonths');
    });
  });
});

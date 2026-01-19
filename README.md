# Ghostbuster

An automated curation system for maintaining a comprehensive directory of Ghost CMS themes and development resources.

## Overview

Ghostbuster is a GitHub-native automation pipeline that transforms the manual process of maintaining a Ghost CMS themes directory into a robust, scalable system. The platform automatically discovers, classifies, and curates Ghost themes while preserving human editorial control through configurable override mechanisms.

**Live Directory**: https://runawaydevil.github.io/Ghostbuster/

## System Architecture

The platform operates as a modular pipeline with the following core components:

### Automated Discovery Engine
Searches GitHub repositories using configurable queries to identify Ghost themes and related resources. The system analyzes repository metadata, file structures, and documentation to determine relevance and quality.

### Intelligent Classification System
Employs heuristic algorithms to score and categorize repositories based on multiple factors including star count, maintenance activity, documentation quality, and theme structure compliance.

### Data Integrity Management
Implements comprehensive validation, duplicate detection, and consistency checks to ensure directory accuracy and reliability.

### Caching Infrastructure
Utilizes efficient API usage patterns with ETag support, TTL management, and rate limiting compliance to optimize GitHub API interactions.

### Template Rendering Engine
Generates responsive HTML directory pages from configurable templates, supporting multiple output formats and customizable presentation layers.

### Staleness Tracking System
Automatically identifies and tracks themes that haven't been updated recently, maintaining them in a separate database and dedicated HTML page. This provides visibility into the complete ecosystem while distinguishing actively maintained projects from stale ones.

## Features

### Staleness Detection and Tracking

Ghostbuster includes an intelligent staleness tracking system that monitors theme maintenance activity and separates stale items from actively maintained ones.

**Key Capabilities:**
- **Automatic Detection**: Identifies themes that haven't been updated within a configurable threshold (default: 12 months)
- **Persistent Storage**: Maintains historical data about stale items in a SQLite database
- **Reactivation Support**: Automatically moves previously stale items back to the active list when they receive updates
- **Separate Directory**: Generates a dedicated "Not Updated Recently" page at `stale.html`
- **Statistics & Reporting**: Provides comprehensive statistics about stale items by category and average staleness duration

**How It Works:**

The system compares each theme's last update date (`pushedAt`) against the configured staleness threshold. Items exceeding the threshold are:
1. Classified as stale and stored in `data/stale-items.db`
2. Removed from the main directory (`index.html`)
3. Displayed on the stale items page (`stale.html`) with prominent warnings
4. Monitored for reactivation on subsequent updates

**Configuration:**

Staleness tracking is configured in `config.yml`:

```yaml
staleness:
  enabled: true                              # Enable/disable staleness tracking
  thresholdMonths: 12                        # Months without updates to be considered stale
  databasePath: 'data/stale-items.db'       # SQLite database location
  renderTemplate: 'templates/stale.template.html'  # Template for stale items page
  renderOutput: 'stale.html'                # Output HTML file
```

**Configuration Options:**

- `enabled` (boolean): Enable or disable the staleness tracking feature entirely
- `thresholdMonths` (integer): Number of months without updates before an item is considered stale. Must be a positive integer. Default: 12
- `databasePath` (string): Path to the SQLite database file for storing stale items. Default: `data/stale-items.db`
- `renderTemplate` (string): Path to the HTML template for rendering the stale items page. Default: `templates/stale.template.html`
- `renderOutput` (string): Path where the generated stale items HTML page will be saved. Default: `stale.html`

**Examples:**

Set a stricter staleness threshold (6 months):
```yaml
staleness:
  enabled: true
  thresholdMonths: 6
  databasePath: 'data/stale-items.db'
  renderTemplate: 'templates/stale.template.html'
  renderOutput: 'stale.html'
```

Set a more lenient threshold (24 months):
```yaml
staleness:
  enabled: true
  thresholdMonths: 24
  databasePath: 'data/stale-items.db'
  renderTemplate: 'templates/stale.template.html'
  renderOutput: 'stale.html'
```

Disable staleness tracking:
```yaml
staleness:
  enabled: false
  thresholdMonths: 12
  databasePath: 'data/stale-items.db'
  renderTemplate: 'templates/stale.template.html'
  renderOutput: 'stale.html'
```

**Viewing Stale Items:**

The stale items page is accessible at `stale.html` and includes:
- Warning message explaining that items haven't been updated recently
- All stale items organized by category (same structure as main directory)
- Last update date prominently displayed for each item
- Statistics showing total stale items, percentage of total, and average staleness
- Links to navigate between the main directory and stale items page

**Database Structure:**

The SQLite database (`data/stale-items.db`) stores complete metadata for each stale item:
- Repository information (name, URL, description)
- Classification data (category, confidence, score)
- GitHub metrics (stars, topics, license)
- Staleness metadata (detection timestamp, months stale)

The database is automatically backed up before modifications and includes integrity validation to ensure data consistency.

## Project Status

Ghostbuster is actively maintained and continuously improved. The system processes hundreds of Ghost theme repositories and maintains an up-to-date directory accessible to the Ghost CMS community.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions, issues, or contributions:
- Create an issue on GitHub
- Email: runawaydevil@pm.me
- Security issues: See Security Policy
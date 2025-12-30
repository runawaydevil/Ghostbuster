# Ghostbuster - Ghost CMS Themes Directory

[![Security](https://img.shields.io/badge/security-reviewed-green.svg)](SECURITY.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

Automated curation system for Ghost CMS themes directory using GitHub Actions and TypeScript.

## 🌟 Overview

Ghostbuster transforms the manual process of maintaining a Ghost CMS themes directory into a robust, GitHub-native pipeline. The system discovers, classifies, and curates Ghost themes automatically while preserving human editorial control through override mechanisms.

**Live Directory**: [https://runawaydevil.github.io/Ghostbuster/](https://runawaydevil.github.io/Ghostbuster/)

## ✨ Features

- **🔍 Automated Discovery**: Searches GitHub for Ghost themes using configurable queries
- **🧠 Intelligent Classification**: Uses heuristics to score and categorize repositories
- **✏️ Human Curation**: Override system for manual editorial control
- **🔒 Data Integrity**: Duplicate detection and consistency validation
- **⚡ Caching**: Efficient API usage with ETag support and TTL management
- **🎨 Template Rendering**: Generates responsive HTML directory from templates
- **🤖 GitHub Actions**: Automated updates with pull request workflow
- **🛡️ Security**: Comprehensive security measures and best practices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- GitHub Personal Access Token with `public_repo` scope

### Installation

1. Clone the repository:
```bash
git clone https://github.com/runawaydevil/Ghostbuster.git
cd Ghostbuster
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment:
```bash
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN
```

4. Initialize default configuration:
```bash
npm run init
```

### Basic Usage

Run a full update:
```bash
npm run update
```

Run a test update (no changes):
```bash
npm run update:dry
```

Run with detailed logging:
```bash
npm run update:verbose
```

## 🔧 Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run update` | Full production update |
| `npm run update:dev` | Development update with TypeScript |
| `npm run update:dry` | Dry run without file changes |
| `npm run update:verbose` | Update with detailed logging |
| `npm run update:skip-crawl` | Skip discovery, process existing data |
| `npm run update:cleanup` | Clean expired cache entries |
| `npm run validate` | Validate configuration and data files |
| `npm run validate:config` | Validate configuration only |
| `npm run validate:data` | Validate data files only |
| `npm run init` | Create default config and data files |
| `npm run stats` | Show cache statistics |
| `npm run test` | Run test suite |
| `npm run lint` | Check code style |
| `npm run build` | Compile TypeScript |

### CLI Options

```bash
npm run update:dev -- [options]

Options:
  --dry-run         Run without making changes to files
  --skip-crawl      Skip repository discovery phase
  --skip-render     Skip HTML rendering phase
  --cleanup-cache   Clean up expired cache entries before running
  --verbose, -v     Enable verbose logging
  --help, -h        Show help message
```

### Configuration

The system uses YAML configuration files in the `data/` directory:

- `data/sources.yml` - Search queries for discovery
- `data/items.yml` - Discovered items (auto-managed)
- `data/overrides.yml` - Manual overrides for items
- `data/ignore.yml` - Repositories to ignore

Optional `config.yml` for system settings (uses defaults if not present).

### Data Files

#### sources.yml
```yaml
- query: "ghost theme in:name,description,readme language:handlebars"
  maxResults: 100
  minStars: 5
- query: "ghost-theme topic:ghost"
  maxResults: 50
  minStars: 10
```

#### overrides.yml
```yaml
- repo: "owner/repo-name"
  name: "Custom Display Name"
  category: "Theme"
  tags_add: ["custom-tag"]
  notes: "Special theme with unique features"
```

#### ignore.yml
```yaml
repos:
  - "owner/unwanted-repo"
patterns:
  - ".*-archived$"
  - "test-.*"
```

### Architecture

The system follows a modular pipeline architecture:

1. **Discovery** (`crawl.ts`) - GitHub API search and metadata collection
2. **Classification** (`classify.ts`) - Scoring and categorization
3. **Merging** (`merge.ts`) - Data integration with overrides
4. **Rendering** (`render.ts`) - HTML template processing
5. **Orchestration** (`update.ts`) - Pipeline coordination

### Testing

Run the test suite:
```bash
npm run test
```

Run tests in watch mode:
```bash
npm run test:watch
```

The system includes both unit tests and property-based tests for comprehensive validation.

### Caching

The system implements intelligent caching:

- **File-based cache** with TTL management
- **ETag support** for conditional requests
- **Rate limit compliance** with exponential backoff
- **Cache statistics** and cleanup utilities

View cache statistics:
```bash
npm run stats
```

Clean expired cache entries:
```bash
npm run clean:cache
```

## 🛡️ Security

This project follows security best practices:

- **🔐 Token Security**: GitHub tokens stored as secrets, never in code
- **🔒 Minimal Permissions**: Uses only required GitHub API scopes
- **✅ Input Validation**: All data is validated and sanitized
- **🚫 No Sensitive Data**: Only public repository metadata is processed
- **🔄 Regular Updates**: Dependencies and security measures regularly updated

For security concerns, please see our [Security Policy](SECURITY.md).

## 🤖 GitHub Actions Integration

The system is designed to run in GitHub Actions with scheduled updates and pull request automation.

Example workflow:
```yaml
name: Update Ghost Directory
on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run update
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          title: 'Automated directory update'
          body: 'Automated update of Ghost themes directory'
```

## Troubleshooting

### Common Issues

**Rate Limit Errors**
- The system respects GitHub API limits automatically
- Use `--verbose` to monitor API usage
- Cache helps reduce API calls on subsequent runs

**Configuration Errors**
- Run `npm run validate` to check all files
- Use `npm run init` to recreate default files
- Check `.env` file for required `GITHUB_TOKEN`

**Data Validation Errors**
- Run `npm run validate:data` for specific errors
- Check YAML syntax in data files
- Ensure required fields are present

### Debug Mode

Enable verbose logging for detailed information:
```bash
npm run update:verbose
```

This shows:
- API call details and rate limiting
- Classification scores and reasoning
- Data merging decisions
- Cache hit/miss statistics

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Run `npm run lint` and `npm run test`
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Submit a pull request

Please read our [Security Policy](SECURITY.md) for security-related contributions.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 📞 Support

For issues and questions:
- 🐛 Create an issue on GitHub
- 📧 Email: runawaydevil@pm.me
- 🔒 Security issues: See [Security Policy](SECURITY.md)

## 🙏 Acknowledgments

- Ghost CMS team for the amazing platform
- GitHub for providing the API and Actions platform
- All theme developers in the Ghost community

---

**🎯 Ghostbuster** - Discover, classify, and curate Ghost themes with confidence.

*Made with ❤️ for the Ghost CMS community*
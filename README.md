# Ghostbuster - Ghost CMS Themes Directory

[![Security](https://img.shields.io/badge/security-reviewed-green.svg)](SECURITY.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

An automated curation system for maintaining a comprehensive directory of Ghost CMS themes and development resources.

## Overview

Ghostbuster is a GitHub-native automation pipeline that transforms the manual process of maintaining a Ghost CMS themes directory into a robust, scalable system. The platform automatically discovers, classifies, and curates Ghost themes while preserving human editorial control through configurable override mechanisms.

**Live Directory**: [https://runawaydevil.github.io/Ghostbuster/](https://runawaydevil.github.io/Ghostbuster/)

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

### Human Curation Interface
Provides override mechanisms allowing manual editorial control over automated classifications, custom categorization, and content exclusion rules.

### Security Framework
Implements comprehensive security measures including token management, input validation, minimal permissions, and automated vulnerability scanning.

## Configuration Management

The system utilizes YAML-based configuration files for flexible operation:

- **Sources Configuration**: Defines GitHub search queries, result limits, and filtering criteria
- **Override Rules**: Enables manual corrections and custom classifications
- **Ignore Patterns**: Specifies repositories and patterns to exclude from processing
- **Template Settings**: Controls output formatting and presentation options

## Data Processing Pipeline

### Discovery Phase
Executes configurable GitHub API searches to identify potential Ghost theme repositories based on multiple criteria including repository metadata, file structure analysis, and content validation.

### Classification Phase
Applies scoring algorithms that evaluate repositories across dimensions such as maintenance activity, documentation quality, community engagement, and technical compliance with Ghost theme standards.

### Integration Phase
Merges automated classifications with manual overrides, resolves conflicts, and applies business rules to produce the final curated dataset.

### Rendering Phase
Generates static HTML pages from templates, incorporating responsive design principles and modern web standards for optimal user experience across devices.

## Automation Infrastructure

### GitHub Actions Integration
Implements scheduled workflows for automated directory updates, pull request generation, and continuous integration processes.

### Caching Strategy
Employs intelligent caching mechanisms to minimize API usage, respect rate limits, and maintain system performance while ensuring data freshness.

### Error Handling
Includes comprehensive error recovery, logging, and notification systems to ensure reliable operation and facilitate troubleshooting.

## Quality Assurance

### Testing Framework
Incorporates both unit testing and property-based testing methodologies to validate system behavior across diverse input scenarios.

### Data Validation
Implements multi-layer validation processes to ensure data accuracy, completeness, and consistency throughout the processing pipeline.

### Performance Monitoring
Provides detailed analytics on system performance, API usage patterns, and processing efficiency metrics.

## Security

This project implements enterprise-grade security practices:

- **Token Security**: GitHub tokens stored as repository secrets with no code exposure
- **Minimal Permissions**: API access limited to required scopes only
- **Input Validation**: Comprehensive sanitization of all external data
- **Data Privacy**: Processing limited to public repository metadata only
- **Continuous Updates**: Regular dependency updates and security patches

For detailed security information, see our [Security Policy](SECURITY.md).

## Technical Specifications

### Technology Stack
- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Testing**: Vitest with property-based testing
- **Automation**: GitHub Actions
- **Data Format**: YAML configuration, JSON caching
- **Output**: Static HTML with responsive design

### API Integration
- **GitHub REST API**: Repository discovery and metadata collection
- **Rate Limiting**: Intelligent request throttling and backoff strategies
- **Caching**: ETag-based conditional requests with TTL management
- **Error Handling**: Comprehensive retry logic and failure recovery

## Project Status

Ghostbuster is actively maintained and continuously improved. The system processes hundreds of Ghost theme repositories and maintains an up-to-date directory accessible to the Ghost CMS community.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For questions, issues, or contributions:
- Create an issue on GitHub
- Email: runawaydevil@pm.me
- Security issues: See [Security Policy](SECURITY.md)

## Acknowledgments

- Ghost CMS team for creating an exceptional blogging platform
- GitHub for providing robust API and automation infrastructure
- Ghost theme developers and the broader Ghost community

---

**Ghostbuster** - Automated curation for the Ghost CMS ecosystem.
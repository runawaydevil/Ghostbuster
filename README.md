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

## Project Status

Ghostbuster is actively maintained and continuously improved. The system processes hundreds of Ghost theme repositories and maintains an up-to-date directory accessible to the Ghost CMS community.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions, issues, or contributions:
- Create an issue on GitHub
- Email: runawaydevil@pm.me
- Security issues: See Security Policy
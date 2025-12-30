# Requirements Document

## Introduction

Le Ghost é um sistema automatizado para manter um diretório curado de recursos do Ghost CMS (principalmente temas) usando GitHub como plataforma. O sistema transforma o processo manual atual em um pipeline automatizado que descobre, classifica, e mantém uma galeria de temas Ghost atualizada através de GitHub Actions.

## Glossary

- **Ghost_CMS**: Sistema de publicação de conteúdo open source
- **Theme**: Tema visual para Ghost CMS, tipicamente usando Handlebars
- **Crawler**: Sistema automatizado que busca e coleta dados de repositórios
- **Classifier**: Algoritmo que determina se um repositório é um tema Ghost válido
- **Curator**: Sistema que aplica regras de curadoria humana aos dados descobertos
- **Pipeline**: Sequência automatizada de processos (crawl → classify → merge → render)
- **GitHub_Actions**: Plataforma de CI/CD do GitHub
- **Pull_Request**: Proposta de mudança no código que requer revisão
- **Rate_Limit**: Limite de requisições por hora da API do GitHub
- **Heuristic**: Regra baseada em padrões para classificar repositórios

## Requirements

### Requirement 1: Data Management System

**User Story:** As a maintainer, I want a structured data system, so that I can have a single source of truth for all Ghost CMS resources.

#### Acceptance Criteria

1. THE Data_System SHALL store all items in `data/items.yml` as the canonical source
2. WHEN overrides are needed, THE System SHALL apply rules from `data/overrides.yml`
3. WHEN repositories should be ignored, THE System SHALL respect `data/ignore.yml` blacklist
4. THE System SHALL define queries for discovery in `data/sources.yml`
5. THE Data_System SHALL maintain consistent schema across all YAML files

### Requirement 2: Automated Discovery System

**User Story:** As a maintainer, I want automated discovery of Ghost themes, so that the directory stays current without manual intervention.

#### Acceptance Criteria

1. WHEN the crawler runs, THE System SHALL search GitHub using configurable queries
2. THE Crawler SHALL collect repository metadata including stars, last push date, topics, and license
3. THE Crawler SHALL respect GitHub API rate limits through authentication and pagination
4. THE Crawler SHALL cache results to minimize API calls between runs
5. THE Crawler SHALL discover new repositories matching Ghost theme patterns

### Requirement 3: Intelligent Classification System

**User Story:** As a maintainer, I want automatic classification of repositories, so that only relevant Ghost themes are included.

#### Acceptance Criteria

1. THE Classifier SHALL analyze repository topics for Ghost-related keywords
2. THE Classifier SHALL examine README content for Ghost theme indicators
3. THE Classifier SHALL inspect repository structure for typical Ghost theme files
4. THE Classifier SHALL assign confidence scores (high/medium/low) to each repository
5. THE Classifier SHALL exclude archived repositories and obvious non-themes

### Requirement 4: Human Curation Override System

**User Story:** As a maintainer, I want to override automated decisions, so that I can maintain editorial control over the directory.

#### Acceptance Criteria

1. WHEN overrides exist, THE System SHALL prioritize human curation over automated classification
2. THE Override_System SHALL allow renaming, recategorizing, and hiding items
3. THE Override_System SHALL support adding custom notes and tags
4. THE Ignore_System SHALL permanently exclude specified repositories
5. THE System SHALL preserve manual edits during automated updates

### Requirement 5: Automated HTML Generation

**User Story:** As a user, I want an updated HTML directory, so that I can browse current Ghost themes easily.

#### Acceptance Criteria

1. THE Renderer SHALL generate `index.html` from template and structured data
2. THE Generated_HTML SHALL organize themes by category with star counts
3. THE Generated_HTML SHALL include last update timestamp and data source attribution
4. THE Template_System SHALL allow easy visual customization without code changes
5. THE Renderer SHALL preserve responsive design and accessibility features

### Requirement 6: GitHub Actions Integration

**User Story:** As a maintainer, I want automated updates via GitHub Actions, so that the directory maintains itself.

#### Acceptance Criteria

1. THE Workflow SHALL run on schedule (weekly) and manual trigger
2. WHEN changes are detected, THE System SHALL create a pull request instead of direct commits
3. THE Pull_Request SHALL include a summary of discovered, updated, and removed items
4. THE Workflow SHALL use GitHub token authentication for API access
5. THE Workflow SHALL cache dependencies and intermediate results for efficiency

### Requirement 7: Local Development Support

**User Story:** As a developer, I want to run the system locally, so that I can test changes before deployment.

#### Acceptance Criteria

1. THE System SHALL provide `npm run update` command for local execution
2. THE Local_System SHALL work with personal GitHub tokens for API access
3. THE System SHALL generate the same output locally as in GitHub Actions
4. THE Development_Setup SHALL include clear documentation and examples
5. THE System SHALL validate data files and report errors clearly

### Requirement 8: Performance and Reliability

**User Story:** As a system operator, I want efficient and reliable automation, so that the system doesn't fail or exceed API limits.

#### Acceptance Criteria

1. THE System SHALL implement exponential backoff for API rate limiting
2. THE System SHALL use conditional requests (ETag) when possible to reduce API calls
3. THE System SHALL handle network failures gracefully with retries
4. THE System SHALL complete full updates within GitHub Actions time limits
5. THE System SHALL log detailed information for debugging and monitoring

### Requirement 9: Data Quality and Validation

**User Story:** As a maintainer, I want high-quality data, so that users find relevant and accurate information.

#### Acceptance Criteria

1. THE System SHALL validate YAML schema before processing
2. THE System SHALL detect and report duplicate entries
3. THE System SHALL verify repository URLs are accessible
4. THE System SHALL maintain data consistency across updates
5. THE System SHALL provide quality metrics in update reports

### Requirement 10: Extensibility and Configuration

**User Story:** As a maintainer, I want configurable behavior, so that I can adapt the system to changing needs.

#### Acceptance Criteria

1. THE System SHALL allow configuring search queries without code changes
2. THE System SHALL support adjustable classification thresholds
3. THE System SHALL enable custom categorization rules
4. THE Configuration_System SHALL validate settings and provide defaults
5. THE System SHALL document all configuration options clearly
# Artifacts System Specification

## Overview

The Artifacts System extends the existing Assets system to handle code files, documents, datasets, notebooks, and other non-media creative outputs. While Assets focus on multimedia (images, audio, video), Artifacts focus on structured data, code, and documents that are created, modified, and consumed by agents and users in the agentic workspace.

Artifacts are polymorphic assets that can be linked to any entity (Epics, Tasks, Agents, Users) through the existing `asset_links` table, enabling rich contextual associations.

## Core Concepts

### What is an Artifact?

An Artifact is a specialized Asset representing:

- **Code files** (.py, .js, .ts, .java, .cpp, etc.)
- **Documents** (.md, .txt, .pdf, .docx, etc.)
- **Data files** (.csv, .json, .xml, .sql, .parquet, etc.)
- **Notebooks** (.ipynb, .rmd, etc.)
- **Configuration files** (.yaml, .toml, .ini, .json, .env, etc.)
- **Build artifacts** (compiled binaries, package manifests, lockfiles)
- **Reports** (generated analysis, visualizations, model outputs)

### Key Distinctions from Media Assets

| Aspect       | Media Assets (Images/Audio/Video)   | Artifacts (Code/Docs/Data)        |
| ------------ | ----------------------------------- | --------------------------------- |
| Primary Use  | Illustration, atmosphere, reference | Creation, modification, execution |
| Typical Size | Often large (MBs)                   | Usually small (KBs)               |
| Editing      | External tools preferred            | Often edited in-context           |
| Execution    | Passive consumption                 | Can be executed/run by agents     |
| Versioning   | Less frequently versioned           | Frequently versioned/iterated     |
| MIME Types   | image/_, audio/_, video/*           | text/_, application/_, etc.       |

## Artifact Types

### 1. Code Artifacts

- **File Extensions**: .py, .js, .ts, .jsx, .tsx, .java, .cpp, .c, .h, .cs, .go, .rs, .rb, .php, .swift, .kt, .scala, .clj, .hs, .ml, .r, .m, .sh, .bash, .zsh, .fish, .ps1, .bat, .cmd
- **MIME Types**: text/* (primarily), application/javascript, application/typescript, etc.
- **Special Handling**: Syntax highlighting, linting, execution, dependency analysis
- **Labels**: `source`, `script`, `module`, `library`, `test`, `fixture`

### 2. Document Artifacts

- **File Extensions**: .md, .txt, .rst, .adoc, .tex, .latex, .pdf, .doc, .docx, .odt, .rtf
- **MIME Types**: text/markdown, text/plain, text/rtf, application/pdf, application/msword, etc.
- **Special Handling**: Markdown rendering, PDF preview, word count, diff viewing
- **Labels**: `document`, `note`, `spec`, `report`, `readme`, `license`, `changelog`

### 3. Data Artifacts

- **File Extensions**: .csv, .tsv, .json, .xml, .yaml, .yml, .toml, .ini, .cfg, .conf, .properties, .sql, .parquet, .avro, .orc, .feather
- **MIME Types**: text/csv, application/json, application/xml, text/yaml, application/sql, etc.
- **Special Handling**: Schema inference, data preview, filtering, aggregation, validation
- **Labels**: `dataset`, `database`, `dump`, `fixture`, `migration`, `seed`, `backup`

### 4. Notebook Artifacts

- **File Extensions**: .ipynb, .rmd, .jl, .sagemath
- **MIME Types**: application/vnd.jupyter.notebook+json, etc.
- **Special Handling**: Cell execution, output capture, kernel management
- **Labels**: `notebook`, `experiment`, `analysis`, `tutorial`

### 5. Configuration Artifacts

- **File Extensions**: .yaml, .yml, .toml, .ini, .cfg, .conf, .properties, .env, .config, .json, .xml
- **MIME Types**: Same as data artifacts
- **Special Handling**: Schema validation, secret detection, templating
- **Labels**: `config`, `settings`, `environment`, `secrets`, `template`

### 6. Build & Dependency Artifacts

- **File Extensions**: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml, requirements.txt, pyproject.toml, Poetry.lock, Cargo.toml, Cargo.lock, go.mod, go.sum, pom.xml, build.gradle, Makefile, CMakeLists.txt
- **MIME Types**: application/json, text/x-yaml, text/plain, application/xml, etc.
- **Special Handling**: Dependency resolution, vulnerability scanning, build automation
- **Labels**: `manifest`, `lockfile`, `build`, `dependency`

## Artifact Lifecycle

### 1. Creation

- **Agent-generated**: Agents create artifacts through tool use (write_file, create_document, etc.)
- **User-uploaded**: Users upload files via API or UI
- **Imported**: Artifacts imported from external sources (Git, URLs, etc.)
- **Transformed**: Derived from existing artifacts (compilation, minification, translation)

### 2. Storage & Versioning

- Stored using the existing Assets infrastructure (local/S3/GCS)
- Automatic versioning on modification (content-addressable or sequential)
- Diff storage optimization for text-based artifacts
- Backup and retention policies apply

### 3. Retrieval & Viewing

- **API Access**: Standard asset endpoints with artifact-specific metadata
- **UI Components**: Specialized viewers/editors per artifact type
- **Previews**: Inline rendering where possible (markdown, json, images)
- **Downloads**: Original file access for external tooling

### 4. Usage & Execution

- **Code Execution**: Sandboxed runtime for supported languages
- **Document Rendering**: HTML preview for markdown, PDF viewing
- **Data Querying**: SQL/NoSQL query interfaces for data artifacts
- **Notebook Execution**: Kernel-backed cell execution
- **Template Processing**: Variable substitution for config artifacts

### 5. Modification

- **In-place Editing**: Direct modification through UI/IDE
- **Derivative Works**: Create new version based on existing
- **Patch Application**: Apply diffs/edits programmatically
- **Merge Handling**: Conflict resolution for concurrent edits

### 6. Archival & Cleanup

- **Lifecycle Policies**: Automatic archival based on age/usage
- **Referential Integrity**: Cascade deletion when source entities removed
- **Export/Import**: Bulk operations for backup/migration
- **Garbage Collection**: Orphaned artifact cleanup

## Technical Implementation

### Extending the Assets System

Artifacts reuse the existing `assets` and `asset_links` tables with additional metadata:

#### Assets Table Enhancements

```sql
-- Existing columns remain:
-- id UUID PRIMARY KEY
-- asset_type TEXT NOT NULL  -- Extended to include artifact subtypes
-- mime_type TEXT NOT NULL
-- size_bytes INTEGER NOT NULL
-- filename TEXT NOT NULL
-- upload_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()

-- New artifact-specific columns (nullable for backward compatibility):
ALTER TABLE assets ADD COLUMN
  artifact_subtype TEXT;  -- 'code', 'document', 'data', 'notebook', 'config', 'build'
ALTER TABLE assets ADD COLUMN
  language TEXT;          -- Programming language (for code) or format hint
ALTER TABLE assets ADD COLUMN
  is_executable BOOLEAN DEFAULT FALSE;
ALTER TABLE assets ADD COLUMN
  encoding TEXT DEFAULT 'utf-8';  -- Text encoding
ALTER TABLE assets ADD COLUMN
  line_count INTEGER;     -- For text files
ALTER TABLE assets ADD COLUMN
  charset TEXT;           -- Character set detection
```

#### Asset Links Enhancements

```sql
-- Existing columns remain:
-- id UUID PRIMARY KEY
-- asset_id UUID REFERENCES assets(id)
-- entity_type TEXT NOT NULL
-- entity_id UUID NOT NULL
-- label TEXT NOT NULL
-- created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

-- New artifact-specific labeling conventions:
-- For code: 'source', 'test', 'fixture', 'script', 'module', 'library'
-- For documents: 'spec', 'report', 'note', 'readme', 'license', 'changelog'
-- For data: 'dataset', 'backup', 'fixture', 'migration', 'seed'
-- For notebooks: 'experiment', 'analysis', 'tutorial', 'notebook'
-- For config: 'settings', 'environment', 'secrets', 'template'
-- For build: 'manifest', 'lockfile', 'dependency', 'build'
```

### Artifact Service Interface

```typescript
interface ArtifactService extends AssetService {
  // Artifact-specific creation methods
  createCodeArtifact(params: {
    content: string;
    filename: string;
    language?: string; // Auto-detected if not provided
    encoding?: string;
  }): Promise<string>; // Returns artifact ID

  createDocumentArtifact(params: {
    content: string;
    filename: string;
    format: "markdown" | "plain" | "html" | "latex";
  }): Promise<string>;

  createDataArtifact(params: {
    content: string | object; // String for CSV/etc, object for JSON
    filename: string;
    format: "csv" | "json" | "xml" | "yaml" | "sql";
    schema?: JSONSchema; // Optional inferred/provided schema
  }): Promise<string>;

  // Artifact-specific retrieval with enhanced metadata
  getArtifactWithMetadata(id: string): Promise<Artifact & ArtifactMetadata>;

  // Search and filtering
  searchArtifactsByContent(query: string, options?: SearchOptions): Promise<Artifact[]>;
  getArtifactsByLanguage(language: string): Promise<Artifact[]>;
  getArtifactsByType(type: ArtifactType): Promise<Artifact[]>;

  // Execution and processing
  executeCodeArtifact(id: string, context?: ExecutionContext): Promise<ExecutionResult>;
  renderDocumentArtifact(id: string, format?: "html" | "text" | "pdf"): Promise<string>;
  queryDataArtifact(id: string, query: string, language?: "sql" | "javascript"): Promise<any>;

  // Transformation and derivation
  deriveArtifact(sourceId: string, operation: string, params?: any): Promise<string>;
  minifyCodeArtifact(id: string, language: string): Promise<string>;
  formatCodeArtifact(id: string, language: string, style?: string): Promise<string>;
}

// Extended metadata for artifacts
interface ArtifactMetadata extends Asset {
  artifactSubtype: ArtifactType;
  language?: string;
  isExecutable: boolean;
  encoding: string;
  lineCount?: number;
  charset?: string;

  // Computed properties
  sizeKB: number;
  isTextFile: boolean;
  canPreview: boolean;
  canExecute: boolean;
  suggestedEditor?: string; // e.g., 'monaco', 'codemirror', 'textarea'
}

type ArtifactType =
  "code" | "document" | "data" | "notebook" | "config" | "build" | "image" | "audio" | "video"; // Inherits from base assets

interface SearchOptions {
  limit?: number;
  offset?: number;
  fileExtensions?: string[];
  languages?: string[];
  minSize?: number;
  maxSize?: number;
  createdAfter?: Date;
  createdBefore?: Date;
}

interface ExecutionContext {
  timeoutMs?: number;
  memoryLimitMb?: number;
  environmentVars?: Record<string, string>;
  allowedNetwork?: boolean;
  fileSystemAccess?: "none" | "read" | "full";
}

interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  executionTimeMs: number;
  memoryUsedMb?: number;
  artifactsCreated?: string[]; // IDs of any new artifacts produced
}
```

### API Endpoints

#### Artifact-Specific Endpoints (extend existing `/api/assets`)

```http
# Specialized creation endpoints
POST /api/assets/code
Content-Type: application/json
{
  "content": "console.log('hello world');",
  "filename": "hello.js",
  "language": "javascript"
}

POST /api/assets/document
Content-Type: application/json
{
  "content": "# Hello World\n\nThis is a markdown document.",
  "filename": "readme.md",
  "format": "markdown"
}

POST /api/assets/data
Content-Type: application/json
{
  "content": {"name": "John", "age": 30},
  "filename": "data.json",
  "format": "json"
}

# Enhanced retrieval
GET /api/assets/:id/metadata
# Returns enhanced metadata including artifact-specific fields

# Execution endpoints
POST /api/assets/:id/execute
Content-Type: application/json
{
  "timeoutMs": 5000,
  "memoryLimitMb": 128,
  "environmentVars": {"NODE_ENV": "test"}
}
# Returns execution result

POST /api/assets/:id/query
Content-Type: application/json
{
  "query": "SELECT * FROM data WHERE age > 25",
  "language": "sql"
}
# Returns query results

# Transformation endpoints
POST /api/assets/:id/transform
Content-Type: application/json
{
  "operation": "minify",
  "params": {"preserveComments": false}
}
# Returns new artifact ID for transformed version

# Preview endpoints (for UI)
GET /api/assets/:id/preview?format=html
# Returns HTML preview for markdown/documents
GET /api/assets/:id/thumbnail
# Returns thumbnail/preview image for supported types
```

## UI Components

### Artifact Viewer/Editor Components

1. **Universal Artifact Viewer**
   - Auto-detects artifact type and displays appropriate viewer
   - Toolbar with actions: edit, download, execute, share, version history
   - Responsive layout for different screen sizes

2. **Code Editor** (based on Monaco/Codemirror)
   - Syntax highlighting for 50+ languages
   - IntelliSense/autocomplete (language-dependent)
   - Error highlighting and linting
   - Integrated terminal for execution
   - Split-view for code/output

3. **Document Viewer/Editor**
   - Markdown rendering with live preview
   - Rich text editing capabilities
   - PDF viewer with text selection/search
   - Word count and reading time estimates
   - Export to multiple formats

4. **Data Explorer**
   - Spreadsheet-like grid view for CSV/JSON
   - Column filtering and sorting
   - Basic statistics (sum, average, count)
   - Chart generation (bar, line, pie)
   - SQL query interface for structured data

5. **Notebook Interface**
   - Cell-based execution (code/markdown/raw)
   - Output display inline with code
   - Kernel management and interruption
   - Export to HTML/PDF/slides
   - Variable inspector

6. **Configuration Editor**
   - Syntax highlighting for YAML/TOML/JSON/XML
   - Schema validation and autocomplete
   - Secret masking for sensitive fields
   - Diff view for changes
   - Template variable substitution

### Artifact Gallery Enhancements

- **Artifact-specific thumbnails** (code snippets, document previews, data charts)
- **File type badges** showing language/format
- **Size and line count** displayed in grid
- **Execution status indicators** for code artifacts
- **Version badges** showing revision count
- **Language-specific filtering** in sidebar
- **Bulk operations** (download selected, delete selected, execute selected)

## Integration Points

### With Agent Runtime

- **Tools**: `read_file`, `write_file`, `create_document`, `execute_code`, `query_data`
- **Agent Capabilities**: Agents can create, read, execute, and modify artifacts
- **Context Awareness**: Agents aware of artifacts linked to their current task/epic
- **Artifact-based Memory**: Significant artifacts stored as semantic memories

### With Chat System

- **Artifact Sharing**: Drag-and-drop or paste to share artifacts in chat
- **Inline Previews**: Show previews of linked artifacts in chat messages
- **Execution Results**: Display code execution outputs directly in chat
- **Version References**: Link to specific artifact versions in conversations
- **Artifact Commands**: `/run`, `/view`, `/edit` slash commands for artifact interaction

### With Plugin System

- **Artifact Plugins**: Plugins can contribute new artifact types/viewers
- **Language Support**: Add syntax highlighting for new languages
- **Execution Environments**: Add sandboxed runtimes for special languages
- **Format Converters**: Convert between artifact formats (markdown→pdf, etc.)
- **Analysis Tools**: Add linting, formatting, or analysis capabilities for specific types

### With Version Control (Future)

- **Git Integration**: Treat artifact collections as git repositories
- **Change Tracking**: Automatic commits for artifact modifications
- **Branch Support**: Work on different versions/artifacts simultaneously
- **Merge Requests**: Propose changes to artifact collections
- **External Sync**: Synchronize with external GitHub/GitLab repositories

## Security Considerations

### Execution Sandboxing

- **Process Isolation**: Run untrusted code in separate processes/containers
- **Resource Limits**: CPU, memory, disk, and network quotas
- **System Call Filtering**: Restrict dangerous syscalls (seccomp-bpf)
- **Filesystem Sandboxing**: Chroot/jail/restricted access to temp directories
- **Network Controls**: Allow/block external connections per policy

### Content Safety

- **Malware Scanning**: Optional virus/malware detection for uploads
- **Policy Enforcement**: Block forbidden file types or content
- **Sanitization**: HTML/JavaScript sanitization for document previews
- **Secret Detection**: Alert on potential credentials/API keys in artifacts
- **Size Limits**: Prevent resource exhaustion through large uploads

### Access Control

- **Inherited Permissions**: Artifacts inherit access from linked entities
- **Explicit Sharing**: Grant/revoke access to specific users/roles
- **Public Links**: Time-limited, revocable public access URLs
- **Audit Logging**: Track all artifact access, modification, execution

## Configuration

```yaml
artifacts:
  # General settings
  enabled: true
  storageBackend: asset # Uses existing asset storage system

  # Creation limits
  limits:
    maxFileSizeMb: 100
    maxLineCount: 100000
    maxFilesPerUpload: 50

  # Execution sandboxing
  execution:
    enabled: true
    defaultTimeoutMs: 30000
    defaultMemoryMb: 512
    maxConcurrentExecutions: 5
    allowedLanguages: ["javascript", "typescript", "python", "bash", "shell"]
    blockedPaths: ["/etc", "/var", "/usr", "/root", "/proc", "/sys"]
    allowedNetwork: false

  # Preview generation
  previews:
    enabled: true
    markdownEngine: "marked"
    maxPreviewSizeKb: 500
    generateThumbnails: true
    thumbnailSize: [200, 200]

  # Indexing and search
  search:
    enabled: true
    indexContent: true # For text-based artifacts
    indexLanguages: ["javascript", "typescript", "python", "java", "cpp", "go", "rust"]
    minIndexLength: 3
    maxIndexSizeKb: 100

  # Versioning
  versioning:
    enabled: true
    strategy: "content_hash" # or 'sequential' or 'timestamp'
    maxVersionsPerArtifact: 50
    cleanupOlderThanDays: 30

  # Notifications
  notifications:
    onExecutionComplete: true
    onExecutionError: true
    onArtifactCreated: true
    onArtifactUpdated: false
```

## Usage Examples

### Agent Workflow: Web Development Task

1. **Task**: "Create a React component for user authentication"
2. **Agent Actions**:
   - Creates `AuthComponent.js` (code artifact) with initial implementation
   - Creates `AuthComponent.test.js` (code artifact) with unit tests
   - Creates `auth-spec.md` (document artifact) with requirements
   - Runs tests, gets output stored as execution artifact
   - Iteratively refines code based on test results
3. **Artifacts Linked To**: Task entity with labels `source`, `test`, `spec`

### Data Analysis Workflow

1. **Task**: "Analyze customer churn dataset"
2. **Agent Actions**:
   - Uploads `customers.csv` (data artifact)
   - Creates `analysis.py` (code artifact) with pandas analysis
   - Runs analysis, produces `chart.png` (media artifact) and `results.json` (data artifact)
   - Creates `findings.md` (document artifact) with insights
   - Packages everything into `report.zip` (build artifact)
3. **Artifacts Linked To**: Task entity with labels `dataset`, `source`, `visualization`, `result`, `document`

### Configuration Management

1. **Task**: "Set up production environment"
2. **Agent Actions**:
   - Creates `docker-compose.yml` (config artifact)
   - Creates `.env.example` (config artifact) with template variables
   - Creates `setup.sh` (code artifact) for provisioning
   - Generates `secrets.json.enc` (encrypted config artifact) from vault
3. **Artifacts Linked To**: Epic entity with labels `environment`, `template`, `script`, `secrets`

## Relationship to Existing Systems

### Builds Upon Assets System

- Reuses storage, upload/download, linking, serving infrastructure
- Extends metadata with artifact-specific fields
- Leverages existing API endpoints with specialized extensions

### Complements Agent System

- Provides tangible outputs for agent work
- Enables iterative development through artifact modification
- Supports agent-to-agent collaboration via shared artifacts
- Forms the basis for agent memory and learning

### Enables Advanced Features

- **Workflow Automation**: Chains of artifact transformations
- **Model Training**: Datasets as artifacts for ML workflows
- **Documentation Generation**: Code → docs artifacts
- **CI/CD Pipeline**: Build/test/deploy artifacts as pipeline stages
- **Knowledge Base**: Curated artifacts as organizational knowledge

## Future Extensions

### Advanced Features

- **Real-time Collaboration**: Multi-user editing with conflict resolution
- **Artifact Dependencies**: Automatic rebuild when dependencies change
- **Package Publishing**: npm/pip/cargo publish integrations
- **Container Images**: Dockerfile artifacts → image build/push
- **Infrastructure as Code**: Terraform/CDK artifacts → provisioning
- **Machine Learning Models**: Model artifacts → serving/deployment

### Specialized Artifact Types

- **Diagram Artifacts**: Mermaid, PlantUML, Graphviz → SVG/PNG rendering
- **Schema Artifacts**: JSON Schema, Protobuf, Avro → validation tools
- **API Specifications**: OpenAPI/Swagger → client/server generation
- **Test Artifacts**: JUnit, pytest, Jest → result aggregation/reporting
- **Build Logs**: Capture and searchable build/output logs

### Analytics and Insights

- **Artifact Usage Tracking**: Frequency of access/execution by type
- **Language Statistics**: Distribution of programming languages used
- **Complexity Metrics**: Lines of code, cyclomatic complexity, etc.
- **Dependency Graphs**: Visualize relationships between artifacts
- **Quality Trends**: Track linting errors, test coverage over time

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

- [ ] Extend assets table with artifact-specific columns
- [ ] Create basic artifact service with create/get methods
- [ ] Implement code artifact creation and basic viewing
- [ ] Add syntax highlighting for common languages
- [ ] Extend upload API to detect and tag artifact types

### Phase 2: Execution & Transformation (Weeks 3-4)

- [ ] Implement sandboxed code execution service
- [ ] Add execution API endpoints
- [ ] Create basic document viewer (markdown → HTML)
- [ ] Implement data artifact parsing and querying
- [ ] Add transformation APIs (minify, format, convert)

### Phase 3: UI Integration (Weeks 5-6)

- [ ] Build universal artifact viewer component
- [ ] Implement code editor with Monaco/Codemirror
- [ ] Create data grid viewer for CSV/JSON
- [ ] Add artifact gallery enhancements (thumbnails, badges)
- [ ] Integrate with chat for sharing/previewing

### Phase 4: Advanced Features (Weeks 7-8)

- [ ] Add versioning system for artifacts
- [ ] Implement artifact linking and dependency tracking
- [ ] Add execution history and audit logging
- [ ] Create plugin interfaces for artifact types
- [ ] Implement security sandboxing and content validation

### Phase 5: Polish & Examples (Weeks 9-10)

- [ ] Add comprehensive test suite
- [ ] Create example artifacts for documentation
- [ ] Build workflow demonstrations (web dev, data analysis)
- [ ] Performance optimization and benchmarking
- [ ] Documentation and user guides

This specification provides a complete foundation for implementing a robust Artifacts System that extends loop-lore's capabilities beyond simple media handling to full lifecycle management of code, documents, and data—essential for the agentic workspace use case while remaining valuable for traditional RPG workflows.

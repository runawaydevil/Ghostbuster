/**
 * Comprehensive error handling system for Le Ghost
 */

export enum ErrorCode {
  // Configuration errors
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  ENV_MISSING = 'ENV_MISSING',
  
  // Data errors
  DATA_INVALID = 'DATA_INVALID',
  DATA_CORRUPT = 'DATA_CORRUPT',
  DATA_MISSING = 'DATA_MISSING',
  
  // API errors
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_UNAUTHORIZED = 'API_UNAUTHORIZED',
  API_NOT_FOUND = 'API_NOT_FOUND',
  API_SERVER_ERROR = 'API_SERVER_ERROR',
  API_NETWORK_ERROR = 'API_NETWORK_ERROR',
  
  // Processing errors
  CRAWL_FAILED = 'CRAWL_FAILED',
  CLASSIFY_FAILED = 'CLASSIFY_FAILED',
  MERGE_FAILED = 'MERGE_FAILED',
  RENDER_FAILED = 'RENDER_FAILED',
  
  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_PERMISSION = 'FILE_PERMISSION',
  FILE_CORRUPT = 'FILE_CORRUPT',
  
  // Cache errors
  CACHE_ERROR = 'CACHE_ERROR',
  CACHE_FULL = 'CACHE_FULL',
  
  // Unknown errors
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  component?: string;
  operation?: string;
  resource?: string;
  originalError?: string;
  statusCode?: number;
  metadata?: Record<string, any>;
}

/**
 * Enhanced error class with context and recovery suggestions
 */
export class LeGhostError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly suggestions: string[];

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    recoverable: boolean = true,
    suggestions: string[] = []
  ) {
    super(message);
    this.name = 'LeGhostError';
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
    this.recoverable = recoverable;
    this.suggestions = suggestions;
  }

  /**
   * Get formatted error message with context
   */
  getFormattedMessage(): string {
    let message = `[${this.code}] ${this.message}`;
    
    if (this.context.component) {
      message += ` (Component: ${this.context.component})`;
    }
    
    if (this.context.operation) {
      message += ` (Operation: ${this.context.operation})`;
    }
    
    if (this.context.resource) {
      message += ` (Resource: ${this.context.resource})`;
    }
    
    return message;
  }

  /**
   * Get recovery suggestions
   */
  getRecoverySuggestions(): string[] {
    if (this.suggestions.length > 0) {
      return this.suggestions;
    }

    // Default suggestions based on error code
    switch (this.code) {
      case ErrorCode.CONFIG_INVALID:
        return [
          'Check configuration file syntax',
          'Run `npm run validate:config` to identify issues',
          'Use `npm run init` to recreate default configuration'
        ];
      
      case ErrorCode.ENV_MISSING:
        return [
          'Check that .env file exists',
          'Ensure GITHUB_TOKEN is set in environment',
          'Copy .env.example to .env and fill in values'
        ];
      
      case ErrorCode.API_RATE_LIMIT:
        return [
          'Wait for rate limit to reset',
          'Use caching to reduce API calls',
          'Consider using a GitHub App token for higher limits'
        ];
      
      case ErrorCode.API_UNAUTHORIZED:
        return [
          'Check that GITHUB_TOKEN is valid',
          'Ensure token has required permissions',
          'Generate a new personal access token if needed'
        ];
      
      case ErrorCode.DATA_INVALID:
        return [
          'Run `npm run validate:data` to identify issues',
          'Check YAML syntax in data files',
          'Ensure all required fields are present'
        ];
      
      case ErrorCode.FILE_NOT_FOUND:
        return [
          'Check that the file exists',
          'Verify file path is correct',
          'Use `npm run init` to create missing files'
        ];
      
      default:
        return [
          'Check the error message for specific details',
          'Try running with --verbose for more information',
          'Report this issue if the problem persists'
        ];
    }
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      suggestions: this.suggestions,
      stack: this.stack
    };
  }
}

/**
 * Error handler with retry logic and recovery strategies
 */
export class ErrorHandler {
  private errorCounts: Map<ErrorCode, number> = new Map();
  private lastErrors: Map<ErrorCode, Date> = new Map();

  /**
   * Handle error with automatic recovery attempts
   */
  async handleError<T>(
    error: Error | LeGhostError,
    operation: () => Promise<T>,
    maxRetries: number = 3,
    backoffMs: number = 1000
  ): Promise<T> {
    const leGhostError = this.normalizeError(error);
    
    // Log error
    this.logError(leGhostError);
    
    // Update error tracking
    this.updateErrorTracking(leGhostError);
    
    // Check if error is recoverable
    if (!leGhostError.recoverable) {
      throw leGhostError;
    }
    
    // Attempt recovery based on error type
    const recovered = await this.attemptRecovery(leGhostError);
    if (!recovered) {
      throw leGhostError;
    }
    
    // Retry operation with exponential backoff
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.sleep(backoffMs * Math.pow(2, attempt - 1));
        return await operation();
      } catch (retryError) {
        if (attempt === maxRetries) {
          throw this.normalizeError(retryError as Error);
        }
        const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
        console.warn(`Retry attempt ${attempt}/${maxRetries} failed:`, errorMessage);
      }
    }
    
    throw leGhostError;
  }

  /**
   * Convert any error to LeGhostError
   */
  private normalizeError(error: Error | LeGhostError): LeGhostError {
    if (error instanceof LeGhostError) {
      return error;
    }

    // Detect error type from message
    const message = error.message.toLowerCase();
    let code = ErrorCode.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    const suggestions: string[] = [];

    if (message.includes('rate limit')) {
      code = ErrorCode.API_RATE_LIMIT;
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('unauthorized') || message.includes('401')) {
      code = ErrorCode.API_UNAUTHORIZED;
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('not found') || message.includes('404')) {
      code = ErrorCode.API_NOT_FOUND;
      severity = ErrorSeverity.LOW;
    } else if (message.includes('network') || message.includes('timeout')) {
      code = ErrorCode.API_NETWORK_ERROR;
      severity = ErrorSeverity.MEDIUM;
    } else if (message.includes('yaml') || message.includes('parse')) {
      code = ErrorCode.DATA_INVALID;
      severity = ErrorSeverity.HIGH;
    } else if (message.includes('enoent') || message.includes('file not found')) {
      code = ErrorCode.FILE_NOT_FOUND;
      severity = ErrorSeverity.MEDIUM;
    } else if (message.includes('permission') || message.includes('eacces')) {
      code = ErrorCode.FILE_PERMISSION;
      severity = ErrorSeverity.HIGH;
    }

    return new LeGhostError(
      error.message,
      code,
      severity,
      { originalError: error.name },
      true,
      suggestions
    );
  }

  /**
   * Attempt automatic recovery based on error type
   */
  private async attemptRecovery(error: LeGhostError): Promise<boolean> {
    switch (error.code) {
      case ErrorCode.API_RATE_LIMIT:
        // Wait for rate limit reset
        console.log('Rate limit hit, waiting 60 seconds...');
        await this.sleep(60000);
        return true;
      
      case ErrorCode.API_NETWORK_ERROR:
        // Network errors are often temporary
        console.log('Network error detected, will retry...');
        return true;
      
      case ErrorCode.CACHE_ERROR:
        // Clear cache and retry
        console.log('Cache error detected, clearing cache...');
        // Cache clearing logic would go here
        return true;
      
      default:
        return false;
    }
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: LeGhostError): void {
    const logLevel = this.getLogLevel(error.severity);
    const message = error.getFormattedMessage();
    
    switch (logLevel) {
      case 'error':
        console.error('❌', message);
        break;
      case 'warn':
        console.warn('⚠️', message);
        break;
      case 'info':
        console.info('ℹ️', message);
        break;
      default:
        console.log('🔍', message);
    }

    // Show recovery suggestions for high severity errors
    if (error.severity === ErrorSeverity.HIGH || error.severity === ErrorSeverity.CRITICAL) {
      const suggestions = error.getRecoverySuggestions();
      if (suggestions.length > 0) {
        console.log('💡 Recovery suggestions:');
        suggestions.forEach(suggestion => console.log(`   • ${suggestion}`));
      }
    }
  }

  /**
   * Get log level for error severity
   */
  private getLogLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'debug';
    }
  }

  /**
   * Update error tracking statistics
   */
  private updateErrorTracking(error: LeGhostError): void {
    const count = this.errorCounts.get(error.code) || 0;
    this.errorCounts.set(error.code, count + 1);
    this.lastErrors.set(error.code, error.timestamp);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByCode: Record<string, number>;
    recentErrors: Array<{ code: ErrorCode; timestamp: Date; count: number }>;
  } {
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    
    const errorsByCode: Record<string, number> = {};
    for (const [code, count] of this.errorCounts) {
      errorsByCode[code] = count;
    }
    
    const recentErrors = Array.from(this.errorCounts.entries())
      .map(([code, count]) => ({
        code,
        timestamp: this.lastErrors.get(code)!,
        count
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
    
    return {
      totalErrors,
      errorsByCode,
      recentErrors
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset error tracking
   */
  resetStats(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
  }
}

/**
 * Global error handler instance
 */
export const globalErrorHandler = new ErrorHandler();

/**
 * Utility functions for creating specific errors
 */
export const createConfigError = (message: string, context?: ErrorContext): LeGhostError => {
  return new LeGhostError(
    message,
    ErrorCode.CONFIG_INVALID,
    ErrorSeverity.HIGH,
    { component: 'config', ...context },
    true,
    [
      'Check configuration file syntax',
      'Run `npm run validate:config`',
      'Use `npm run init` to recreate defaults'
    ]
  );
};

export const createDataError = (message: string, context?: ErrorContext): LeGhostError => {
  return new LeGhostError(
    message,
    ErrorCode.DATA_INVALID,
    ErrorSeverity.HIGH,
    { component: 'data', ...context },
    true,
    [
      'Run `npm run validate:data`',
      'Check YAML syntax',
      'Ensure required fields are present'
    ]
  );
};

export const createApiError = (message: string, statusCode?: number, context?: ErrorContext): LeGhostError => {
  let code = ErrorCode.API_SERVER_ERROR;
  let severity = ErrorSeverity.MEDIUM;
  let suggestions: string[] = [];

  if (statusCode === 401) {
    code = ErrorCode.API_UNAUTHORIZED;
    severity = ErrorSeverity.HIGH;
    suggestions = ['Check GITHUB_TOKEN is valid', 'Ensure token has required permissions'];
  } else if (statusCode === 403) {
    code = ErrorCode.API_RATE_LIMIT;
    severity = ErrorSeverity.HIGH;
    suggestions = ['Wait for rate limit reset', 'Use caching to reduce API calls'];
  } else if (statusCode === 404) {
    code = ErrorCode.API_NOT_FOUND;
    severity = ErrorSeverity.LOW;
    suggestions = ['Check resource exists', 'Verify URL is correct'];
  }

  return new LeGhostError(
    message,
    code,
    severity,
    { component: 'api', statusCode, ...context },
    true,
    suggestions
  );
};

export const createFileError = (message: string, filePath?: string, context?: ErrorContext): LeGhostError => {
  return new LeGhostError(
    message,
    ErrorCode.FILE_NOT_FOUND,
    ErrorSeverity.MEDIUM,
    { component: 'filesystem', resource: filePath, ...context },
    true,
    [
      'Check file exists',
      'Verify file path is correct',
      'Use `npm run init` to create missing files'
    ]
  );
};
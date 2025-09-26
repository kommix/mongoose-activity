import { activityEvents } from '../events';
import { ActivityLogParams } from '../types';

/**
 * Centralized error handling utility for consistent logging and event emission
 */
export class ActivityErrorHandler {
  private static readonly PREFIX = '[mongoose-activity]';

  /**
   * Log an error with consistent formatting and emit error event
   * @param message Human-readable error message
   * @param error Optional error object
   * @param context Optional context data (e.g., activity params)
   */
  static logError(message: string, error?: unknown, context?: any): void {
    const fullMessage = `${this.PREFIX} ${message}`;
    console.warn(fullMessage, error);

    // Emit error event for programmatic handling
    const errorObj =
      error instanceof Error ? error : new Error(String(error || message));
    activityEvents.emit('activity:error', errorObj, context);
  }

  /**
   * Log a development warning (only in non-production)
   * @param message Warning message
   * @param details Optional additional details
   */
  static logDevelopmentWarning(message: string, details?: any): void {
    if (process.env.NODE_ENV !== 'production') {
      const fullMessage = `${this.PREFIX} ${message}`;
      console.warn(fullMessage, details);
    }
  }

  /**
   * Log activity-specific error with context
   * @param message Error message
   * @param error Error object
   * @param params Activity parameters that caused the error
   */
  static logActivityError(
    message: string,
    error: unknown,
    params: ActivityLogParams
  ): void {
    this.logError(message, error, params);
  }

  /**
   * Log plugin hook error with operation context
   * @param operation The operation that failed (e.g., 'save', 'deleteOne')
   * @param error Error object
   * @param context Optional context data
   */
  static logHookError(operation: string, error: unknown, context?: any): void {
    this.logError(`Error in ${operation} hook:`, error, context);
  }

  /**
   * Log validation warning for schema fields
   * @param fieldType Type of field being validated (e.g., 'trackedFields', 'deletionFields')
   * @param fieldName Name of the invalid field
   * @param schemaName Name of the schema
   * @param availableFields List of available field names
   */
  static logFieldValidationWarning(
    fieldType: string,
    fieldName: string,
    schemaName: string,
    availableFields: string[]
  ): void {
    const message = `${fieldType} field "${fieldName}" not found in schema "${schemaName}". Available paths: ${availableFields.join(', ')}`;
    this.logDevelopmentWarning(message);
  }
}

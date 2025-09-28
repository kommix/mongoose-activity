/**
 * Utility functions for middleware context extraction and error handling
 */

/**
 * Safely executes an extractor function and handles errors gracefully
 * @param extractor Function to execute
 * @param fieldName Name of the field being extracted (for error logging)
 * @returns Extracted value or undefined if error occurs
 */
export function safeExtract<T>(
  extractor: () => T,
  fieldName: string
): T | undefined {
  try {
    return extractor();
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        `[mongoose-activity] Failed to extract ${fieldName}:`,
        error
      );
    }
    return undefined;
  }
}

/**
 * Interface for extractor configuration
 */
export interface ExtractorConfig {
  extractor: (() => any) | undefined;
  fieldName: string;
  contextKey: string;
}

/**
 * Builds context object from extractor functions with error handling
 * @param extractors Array containing extractor functions and their names
 * @returns Context object with safely extracted values
 */
export function buildContext(
  extractors: ExtractorConfig[]
): Record<string, any> {
  const context: Record<string, any> = {};

  for (const { extractor, fieldName, contextKey } of extractors) {
    if (extractor) {
      const value = safeExtract(extractor, fieldName);
      if (value !== undefined) {
        context[contextKey] = value;
      }
    }
  }

  return context;
}

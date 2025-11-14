/**
 * SSMLValidator - Validates SSML for AWS Polly compatibility
 *
 * Ensures generated SSML:
 * - Is well-formed XML
 * - Only uses supported tags for the voice type
 * - Has proper <speak> root element
 * - Doesn't exceed length limits
 */

import type { ValidationResult } from "../../types/ProcessorTypes";

/**
 * Tags supported by AWS Polly Neural voices
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NEURAL_SUPPORTED_TAGS = [
  "speak",
  "break",
  "lang",
  "mark",
  "p",
  "s",
  "say-as",
  "sub",
  "w",
  "prosody",
  "phoneme",
];

/**
 * Tags NOT supported by Neural voices (reserved for future use)
 */

const NEURAL_UNSUPPORTED_TAGS = [
  "emphasis", // Not supported for neural
  "amazon:auto-breaths",
  "amazon:domain",
  "amazon:effect",
];

/**
 * Validate SSML string
 */
export function validateSSML(
  ssml: string,
  voiceType: "neural" | "standard" | "long-form" = "neural",
  maxLength: number = 6000,
): ValidationResult {
  const errors: string[] = [];

  // Check if empty
  if (!ssml || ssml.trim().length === 0) {
    errors.push("SSML is empty");
    return { isValid: false, errors };
  }

  // Check length
  if (ssml.length > maxLength) {
    errors.push(`SSML exceeds maximum length: ${ssml.length} > ${maxLength}`);
  }

  // Check for <speak> root
  if (!ssml.trim().startsWith("<speak>")) {
    errors.push("SSML must start with <speak> tag");
  }

  if (!ssml.trim().endsWith("</speak>")) {
    errors.push("SSML must end with </speak> tag");
  }

  // Check for unsupported tags (neural voices)
  if (voiceType === "neural") {
    for (const tag of NEURAL_UNSUPPORTED_TAGS) {
      const regex = new RegExp(`<${tag}[\\s>]`, "i");
      if (regex.test(ssml)) {
        errors.push(`Tag <${tag}> is not supported for neural voices`);
      }
    }
  }

  // Basic XML well-formedness check
  const xmlErrors = checkXMLWellFormedness(ssml);
  errors.push(...xmlErrors);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Basic XML well-formedness check
 * (Simple stack-based tag matching)
 */
function checkXMLWellFormedness(xml: string): string[] {
  const errors: string[] = [];
  const tagStack: string[] = [];

  // Find all tags (opening and closing)
  const tagRegex = /<\/?([a-zA-Z:]+)(?:\s[^>]*)?>/g;
  let match;

  while ((match = tagRegex.exec(xml)) !== null) {
    const fullTag = match[0];
    const tagName = match[1];

    // Self-closing tag (like <break/>)
    if (fullTag.endsWith("/>")) {
      continue;
    }

    // Closing tag
    if (fullTag.startsWith("</")) {
      if (tagStack.length === 0) {
        errors.push(`Unexpected closing tag: </${tagName}>`);
      } else {
        const lastTag = tagStack.pop();
        if (lastTag !== tagName) {
          errors.push(
            `Tag mismatch: expected </${lastTag}>, found </${tagName}>`,
          );
        }
      }
    }
    // Opening tag
    else {
      tagStack.push(tagName);
    }
  }

  // Check for unclosed tags
  if (tagStack.length > 0) {
    errors.push(`Unclosed tags: ${tagStack.map((t) => `<${t}>`).join(", ")}`);
  }

  return errors;
}

/**
 * Quick validation - just checks critical issues
 */
export function quickValidateSSML(ssml: string): boolean {
  if (!ssml || ssml.trim().length === 0) return false;
  if (!ssml.includes("<speak>")) return false;
  if (!ssml.includes("</speak>")) return false;
  return true;
}

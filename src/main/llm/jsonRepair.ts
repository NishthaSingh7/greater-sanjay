function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function sliceJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response');
  }
  return text.slice(start, end + 1);
}

function removeTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, '$1');
}

/** Quote bare identifiers inside [...] e.g. [Meta, "t"] or [Meta,t] */
function quoteBareArrayTokens(json: string): string {
  return json.replace(/\[([^\]]*)\]/g, (_match, inner: string) => {
    if (!inner.trim()) {
      return '[]';
    }

    const parts = inner.split(',').map((part) => {
      let token = part.trim();
      if (!token) {
        return token;
      }

      if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        if (token.startsWith("'")) {
          token = `"${token.slice(1, -1).replace(/"/g, '\\"')}"`;
        }
        return token;
      }

      if (/^-?\d+(\.\d+)?$/.test(token)) {
        return token;
      }

      if (token === 'true' || token === 'false' || token === 'null') {
        return token;
      }

      return `"${token}"`;
    });

    return `[${parts.join(', ')}]`;
  });
}

function tryParse(candidate: string): unknown | null {
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Parse JSON from LLM output, applying repairs for common malformations
 * (unquoted Meta/t in arrays, trailing commas, code fences).
 */
export function parseModelJson(text: string): unknown {
  const candidate = sliceJsonObject(stripCodeFence(text));

  const attempts = [
    candidate,
    removeTrailingCommas(candidate),
    quoteBareArrayTokens(candidate),
    quoteBareArrayTokens(removeTrailingCommas(candidate)),
  ];

  for (const attempt of attempts) {
    const parsed = tryParse(attempt);
    if (parsed !== null) {
      return parsed;
    }
  }

  throw new SyntaxError(
    `Could not parse model JSON. Sample: ${candidate.slice(0, 120)}`
  );
}

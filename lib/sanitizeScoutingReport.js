function sanitizeScoutingReport(reportData, privacyRules) {
  const warnings = [];
  const defaultRules = [
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /(?:\+?\d[\d ()-]{6,}\d)/g
  ];
  const rules = privacyRules === undefined ? defaultRules : privacyRules;
  const validRules = Array.isArray(rules) ? rules.filter(rule => rule instanceof RegExp) : [];
  const sanitizedReport = deepSanitize(reportData, validRules, '', warnings);
  return { sanitizedReport, warnings };
}

function deepSanitize(value, rules, path, warnings) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let sanitized = value;
    for (const rule of rules) {
      const flags = rule.flags.includes('g') ? rule.flags : `${rule.flags}g`;
      const safeRule = new RegExp(rule.source, flags);
      if (safeRule.test(sanitized)) {
        safeRule.lastIndex = 0;
        sanitized = sanitized.replace(safeRule, '[REDACTED]');
        if (!warnings.includes(path)) warnings.push(path);
      }
    }
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => deepSanitize(item, rules, `${path}[${index}]`, warnings));
  }
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value)) {
      const newPath = path ? `${path}.${key}` : key;
      result[key] = deepSanitize(value[key], rules, newPath, warnings);
    }
    return result;
  }
  return value;
}

module.exports = { sanitizeScoutingReport };

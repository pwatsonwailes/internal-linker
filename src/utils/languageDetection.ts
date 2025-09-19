// stopWords import removed - not used in this file

// CPU-based pattern matching
function countPatternMatches(text: string, pattern: string): number {
  let count = 0;
  let pos = text.indexOf(pattern);
  while (pos !== -1) {
    count++;
    pos = text.indexOf(pattern, pos + 1);
  }
  return count;
}

// Simple language detection based on character and word patterns
export function detectLanguage(text: string): 'en' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'ja' {
  // Convert text to lowercase for consistent matching
  const normalizedText = text.toLowerCase();
  
  // Check for Japanese characters first (most distinctive)
  const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
  if (hasJapanese) return 'ja';
  
  // Language specific patterns
  const patterns = {
    en: ['the', 'is', 'at', 'in', 'that', 'this'],
    fr: ['le', 'la', 'les', 'est', 'sont', 'dans'],
    de: ['der', 'die', 'das', 'ist', 'und', 'für'],
    es: ['el', 'la', 'los', 'las', 'es', 'en'],
    it: ['il', 'lo', 'la', 'gli', 'le', 'è'],
    pt: ['o', 'a', 'os', 'as', 'é', 'em']
  };

  const scores: Record<string, number> = {};
  
  for (const [lang, langPatterns] of Object.entries(patterns)) {
    scores[lang] = langPatterns.reduce((sum, pattern) => 
      sum + countPatternMatches(normalizedText, pattern), 0
    );
    
    // Additional language-specific characteristics
    if (lang === 'de' && (normalizedText.includes('ß') || normalizedText.includes('ü'))) {
      scores[lang] += 2;
    }
    if (lang === 'fr' && (normalizedText.includes('ç') || normalizedText.includes('é'))) {
      scores[lang] += 1;
    }
    if (lang === 'es' && normalizedText.includes('ñ')) {
      scores[lang] += 2;
    }
    if (lang === 'pt' && (normalizedText.includes('ã') || normalizedText.includes('õ'))) {
      scores[lang] += 2;
    }
  }

  // Find language with highest score
  return Object.entries(scores)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0] as keyof typeof patterns;
}
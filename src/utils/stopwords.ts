// Multilingual stop words
export const stopWords = {
  en: new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'the', 'this', 'but', 'they', 'have', 'had', 'what', 'when',
    'where', 'who', 'which', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'can', 'just', 'should', 'now', 'i',
    'you', 'your', 'we', 'my', 'me', 'her', 'his', 'their', 'our', 'us', 'am',
    'been', 'being', 'do', 'does', 'did', 'doing', 'would', 'could', 'might',
    'must', 'shall', 'into', 'if', 'then', 'else', 'out', 'about', 'over',
    'again', 'once', 'under', 'further', 'before', 'after', 'above', 'below',
    'up', 'down', 'in', 'out', 'on', 'off', 'through', 'while', 'during'
  ]),
  fr: new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'en',
    'que', 'qui', 'dans', 'pour', 'sur', 'au', 'avec', 'par', 'mais', 'ou',
    'où', 'donc', 'or', 'ni', 'car', 'ce', 'ces', 'cette', 'cet', 'il', 'elle',
    'ils', 'elles', 'nous', 'vous', 'leur', 'leurs', 'mon', 'ton', 'son',
    'notre', 'votre', 'tout', 'tous', 'toute', 'toutes', 'même', 'quel',
    'quelle', 'quels', 'quelles', 'sans', 'très', 'plus', 'moins', 'autre',
    'autres', 'être', 'avoir', 'faire', 'dire', 'aller', 'voir', 'venir',
    'prendre', 'donner', 'falloir', 'pouvoir', 'vouloir', 'savoir'
  ]),
  de: new Set([
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines',
    'einem', 'einen', 'und', 'oder', 'aber', 'auch', 'wenn', 'dann', 'als',
    'seit', 'von', 'aus', 'nach', 'bei', 'bis', 'durch', 'für', 'mit', 'zu',
    'zur', 'zum', 'in', 'im', 'an', 'auf', 'über', 'unter', 'neben', 'zwischen',
    'hinter', 'vor', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie',
    'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'nicht', 'kein', 'keine',
    'nur', 'noch', 'schon', 'jetzt', 'hier', 'da', 'dort', 'dieser', 'diese',
    'dieses', 'jener', 'jene', 'jenes', 'welcher', 'welche', 'welches'
  ]),
  es: new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero',
    'si', 'de', 'del', 'a', 'ante', 'bajo', 'con', 'contra', 'desde', 'en',
    'entre', 'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'sobre', 'tras',
    'yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ellos', 'ellas', 'este',
    'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella',
    'aquellos', 'aquellas', 'mi', 'tu', 'su', 'nuestro', 'vuestro', 'qué',
    'cuál', 'quién', 'dónde', 'cuándo', 'por qué', 'cómo'
  ]),
  it: new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'uno', 'una', 'un', 'e', 'o', 'ma',
    'se', 'perché', 'anche', 'come', 'dove', 'quando', 'chi', 'che', 'cui',
    'non', 'più', 'quale', 'quanto', 'quanti', 'quanta', 'quante', 'quello',
    'quella', 'quelli', 'quelle', 'questo', 'questa', 'questi', 'queste', 'si',
    'tutto', 'tutti', 'tutte', 'tutta', 'nei', 'nel', 'nella', 'nelle', 'negli',
    'suo', 'sua', 'suoi', 'sue', 'mio', 'mia', 'miei', 'mie', 'tuo', 'tua',
    'tuoi', 'tue', 'nostro', 'nostra', 'nostri', 'nostre'
  ]),
  pt: new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas', 'se',
    'porque', 'que', 'quando', 'onde', 'como', 'quem', 'qual', 'quais', 'de',
    'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'ao', 'à', 'aos', 'às',
    'pelo', 'pela', 'pelos', 'pelas', 'este', 'esta', 'estes', 'estas', 'esse',
    'essa', 'esses', 'essas', 'aquele', 'aquela', 'aqueles', 'aquelas', 'isto',
    'isso', 'aquilo', 'meu', 'minha', 'meus', 'minhas', 'teu', 'tua', 'teus'
  ]),
  ja: new Set([
    'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ',
    'ある', 'いる', 'も', 'な', 'に', 'な', 'この', 'これ', 'その', 'それ',
    'あの', 'あれ', 'どの', 'どれ', 'わたし', 'あなた', 'かれ', 'かのじょ',
    'から', 'まで', 'より', 'によって', 'について', 'として', 'ために',
    'および', 'または', 'すなわち', 'かつ', 'ところが', 'ただし', 'しかし',
    'また', 'でも', 'そして', 'なお', 'だが', 'けれども'
  ])
};
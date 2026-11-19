import type { LanguageCode } from '../../data/languages'

/**
 * DeepL API v2 provider (BYOK).
 *
 * Docs: https://developers.deepl.com/docs/api-reference/translate
 * Supported languages: https://developers.deepl.com/docs/resources/supported-languages
 *
 * Keys of the DeepL API Free plan end with `:fx` and must be used against
 * `api-free.deepl.com`, all other keys against `api.deepl.com`.
 */

const TARGET_LANGUAGES: Partial<Record<LanguageCode, string>> = {
  'ar': 'AR',
  'bg': 'BG',
  'cs': 'CS',
  'da': 'DA',
  'de': 'DE',
  'el': 'EL',
  'en': 'EN-US',
  'es': 'ES',
  'et': 'ET',
  'fi': 'FI',
  'fr': 'FR',
  'hu': 'HU',
  'id': 'ID',
  'it': 'IT',
  'ja': 'JA',
  'ko': 'KO',
  'lt': 'LT',
  'lv': 'LV',
  'nl': 'NL',
  'no': 'NB',
  'pl': 'PL',
  'pt': 'PT-PT',
  'ro': 'RO',
  'ru': 'RU',
  'sk': 'SK',
  'sl': 'SL',
  'sv': 'SV',
  'tr': 'TR',
  'uk': 'UK',
  'zh-CN': 'ZH-HANS',
  'zh-TW': 'ZH-HANT',
}

const SOURCE_LANGUAGES: Partial<Record<LanguageCode, string>> = {
  'ar': 'AR',
  'bg': 'BG',
  'cs': 'CS',
  'da': 'DA',
  'de': 'DE',
  'el': 'EL',
  'en': 'EN',
  'es': 'ES',
  'et': 'ET',
  'fi': 'FI',
  'fr': 'FR',
  'hu': 'HU',
  'id': 'ID',
  'it': 'IT',
  'ja': 'JA',
  'ko': 'KO',
  'lt': 'LT',
  'lv': 'LV',
  'nl': 'NL',
  'no': 'NB',
  'pl': 'PL',
  'pt': 'PT',
  'ro': 'RO',
  'ru': 'RU',
  'sk': 'SK',
  'sl': 'SL',
  'sv': 'SV',
  'tr': 'TR',
  'uk': 'UK',
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
}

const DETECTED_LANGUAGES: Record<string, LanguageCode> = {
  AR: 'ar',
  BG: 'bg',
  CS: 'cs',
  DA: 'da',
  DE: 'de',
  EL: 'el',
  EN: 'en',
  ES: 'es',
  ET: 'et',
  FI: 'fi',
  FR: 'fr',
  HU: 'hu',
  ID: 'id',
  IT: 'it',
  JA: 'ja',
  KO: 'ko',
  LT: 'lt',
  LV: 'lv',
  NB: 'no',
  NL: 'nl',
  PL: 'pl',
  PT: 'pt',
  RO: 'ro',
  RU: 'ru',
  SK: 'sk',
  SL: 'sl',
  SV: 'sv',
  TR: 'tr',
  UK: 'uk',
  ZH: 'zh-CN',
}

export function getDeepLTargetLanguage(code: LanguageCode): string | undefined {
  return TARGET_LANGUAGES[code]
}

export function getDeepLSourceLanguage(code: LanguageCode): string | undefined {
  return SOURCE_LANGUAGES[code]
}

export function getDeepLEndpoint(apiKey: string): string {
  return apiKey.trim().endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate'
}

function deeplError(message: string, name: string): Error {
  const err = new Error(message)
  err.name = name
  return err
}

export interface DeepLTranslateResult {
  text: string
  detectedFrom?: LanguageCode
}

export async function translateWithDeepL(
  text: string,
  from: LanguageCode,
  to: LanguageCode,
  apiKey: string,
): Promise<DeepLTranslateResult> {
  const targetLang = getDeepLTargetLanguage(to)
  if (!targetLang)
    throw deeplError(`DeepL does not support translating to "${to}"`, 'UnsupportedLanguageError')

  // Omit `source_lang` to let DeepL autodetect, also when the explicitly
  // selected source language is not supported by DeepL.
  const sourceLang = from === 'auto' ? undefined : getDeepLSourceLanguage(from)

  const res = await fetch(getDeepLEndpoint(apiKey), {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang,
      ...(sourceLang ? { source_lang: sourceLang } : {}),
    }),
  })

  if (!res.ok) {
    switch (res.status) {
      case 403:
        throw deeplError('the DeepL API key is invalid or inactive, please check the extension preferences', 'DeepLForbiddenError')
      case 429:
        throw deeplError('please try again later', 'TooManyRequestsError')
      case 456:
        throw deeplError('the DeepL API quota has been reached, please try again next month', 'DeepLQuotaExceededError')
      default:
        throw deeplError(`DeepL request failed (HTTP ${res.status})`, 'DeepLError')
    }
  }

  const data = await res.json() as {
    translations?: { detected_source_language?: string, text: string }[]
  }
  const translation = data.translations?.[0]
  if (!translation)
    throw deeplError('DeepL returned an empty response', 'DeepLError')

  return {
    text: translation.text,
    detectedFrom: translation.detected_source_language
      ? DETECTED_LANGUAGES[translation.detected_source_language]
      : undefined,
  }
}

import type { LanguageCode } from '../data/languages'
import type { TranslateResult } from '../types'
import googleTranslate from '@iamtraction/google-translate'
import { getPreferenceValues } from '@raycast/api'
import { LRUCache } from 'lru-cache'
import { getDeepLTargetLanguage, translateWithDeepL } from './providers/deepl'

export const AUTO_DETECT = 'auto'

const cache = new LRUCache<string, TranslateResult>({
  max: 1000,
})

export class TranslateError extends Error {
  constructor(message?: string | Error, name?: string) {
    if (message instanceof Error) {
      super(message.message)
      this.name = name || message.name
    }
    else {
      super(message)
      this.name = name || this.name
    }
  }
}

async function translateWithGoogle(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  const translated = await googleTranslate(text, {
    from,
    to,
  })

  return {
    original: text,
    translated: translated.text,
    from: translated?.from?.language?.didYouMean
      ? from
      : translated?.from?.language?.iso as LanguageCode,
    to,
  }
}

async function translateWithDeepLProvider(text: string, from: LanguageCode, to: LanguageCode, apiKey: string): Promise<TranslateResult> {
  const translated = await translateWithDeepL(text, from, to, apiKey)

  return {
    original: text,
    translated: translated.text,
    from: from === 'auto'
      ? translated.detectedFrom ?? from
      : from,
    to,
  }
}

export async function translate(text: string, from: LanguageCode, to: LanguageCode): Promise<TranslateResult> {
  if (!text) {
    return {
      original: text,
      translated: '',
      from,
      to,
    }
  }

  const preferences = getPreferenceValues<Preferences.Translate>()
  const useDeepL = preferences.translationProvider === 'deepl'
  const deeplApiKey = preferences.deeplApiKey?.trim()

  const key = `${useDeepL ? 'deepl' : 'google'}:${from}:${to}:${text}`
  const cached = cache.get(key)
  if (cached)
    return cached

  try {
    let result: TranslateResult

    if (useDeepL) {
      if (!deeplApiKey)
        throw new TranslateError('please set your DeepL API key in the extension preferences', 'DeepL API key missing')

      // DeepL does not cover every language of this extension. Fall back to
      // Google Translate for target languages DeepL does not support, so a
      // multi-translate run still returns a result for every language.
      result = getDeepLTargetLanguage(to)
        ? await translateWithDeepLProvider(text, from, to, deeplApiKey)
        : await translateWithGoogle(text, from, to)
    }
    else {
      result = await translateWithGoogle(text, from, to)
    }

    cache.set(key, result)
    return result
  }
  catch (err) {
    if (err instanceof Error) {
      switch (err.name) {
        case 'TooManyRequestsError':
          throw new TranslateError('please try again later', 'Too many requests')
        default:
          throw new TranslateError(err)
      }
    }

    throw err
  }
}

export async function translateAll(text: string, from: LanguageCode = 'auto', languages: LanguageCode[]) {
  if (!text)
    return []

  const result = (await Promise.all(languages.map(async to => translate(text, from, to)))).filter(i => i.translated)

  const fromLangs = new Set(result?.map(i => i.from))
  const singleSource = fromLangs.size === 1
  if (singleSource)
    return result.filter(i => i.from !== i.to && i.translated.trim().toLowerCase() !== i.original.trim().toLowerCase())
  return result
}

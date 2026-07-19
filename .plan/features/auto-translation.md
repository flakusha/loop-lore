# Auto-Translation Layer Implementation

## Overview

Transparent translation of user input/output. User chats in their language, model responds in its training language.

## Implementation

### File: src/i18n/translation-middleware.ts

```typescript
export interface TranslationContext {
  userLanguage: string;
  modelLanguage: string;
  translateInput: boolean;
  translateOutput: boolean;
}

export async function translationMiddleware(req: Request, next: () => Promise<Response>,): Promise<Response> {
  const user = await authenticate(req,);
  const userLang = user.settings?.language || "en";
  const modelLang = getModelLanguage(req,); // From model config

  // Only translate if needed
  if (userLang === modelLang) {
    return next();
  }

  // Wrap the request handler
  const originalBody = await req.json();

  // Translate input messages
  if (originalBody.messages) {
    for (const msg of originalBody.messages) {
      if (msg.role === "user") {
        msg.content = await translate(msg.content, userLang, modelLang,);
      }
    }
  }

  // Create modified request
  const translatedReq = new Request(req, {
    body: JSON.stringify(originalBody,),
  },);

  const response = await next();

  // Translate output
  if (response.ok && originalBody.stream) {
    // Stream translation (complex)
    return translateStream(response, modelLang, userLang,);
  }

  const data = await response.json();

  if (data.choices?.[0]?.message?.content) {
    data.choices[0].message.content = await translate(data.choices[0].message.content, modelLang, userLang,);
  }

  return new Response(JSON.stringify(data,), response,);
}
```

### File: src/i18n/translator.ts

```typescript
export async function translate(text: string, from: string, to: string,): Promise<string> {
  // Try configured provider first
  if (config.translation_provider) {
    return translateWithProvider(text, from, to,);
  }

  // Fallback to LLM-based translation
  const prompt = `
Translate from ${from} to ${to}. Return only the translated text.

"${text}"
`;

  return llmGenerate({
    messages: [{ role: "user", content: prompt, },],
    temperature: 0.1,
    maxTokens: Math.max(text.length, 1000,),
  },);
}

export async function translateWithProvider(text: string, from: string, to: string,): Promise<string> {
  const response = await fetch(config.translation_endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.translation_api_key}`, },
    body: JSON.stringify({
      q: text,
      source: from,
      target: to,
      format: "text",
    },),
  },);

  const data = await response.json();
  return data.translatedText;
}
```

### UI Integration

```typescript
// src/frontend/alpine/translation-indicator.ts
export default function() {
  return {
    translated: false,
    originalText: "",

    init() {
      this.translated = this.$el.dataset.translated === "true";
      this.originalText = this.$el.dataset.original || "";
    },

    showOriginal() {
      // Toggle to show original text
      this.$el.querySelector(".translated",).classList.add("hidden",);
      this.$el.querySelector(".original",).classList.remove("hidden",);
    },
  };
}
```

## Edge Cases

- Translation API fails → fallback to LLM
- LLM translation is poor → user can report
- Streaming translation → buffer chunks, translate on sentence boundaries
- Mixed language input → detect dominant language, translate that
- Profanity in translation → re-check after translation
- Token cost → estimate before translating
- User language unsupported → error message

## Configuration

```yaml
# src/config/translation.yaml
translation:
  enabled: true
  provider: "google" | "deepl" | "llm" | null
  api_key: "" # For external providers
  model: "gemma-2-translate" # For LLM fallback
  user_languages: ["en", "es", "fr", "de", "ja", "zh", "ru", "pt"]
```

## User Settings

```
Settings → Language → Auto-translate: on/off
Settings → Language → Translation provider: Google/Deepl/LLM
Settings → Language → Show original: on hover/click/always
```

## Privacy

- Translation content NOT stored
- Translation failures NOT logged with content
- User can disable for sensitive conversations

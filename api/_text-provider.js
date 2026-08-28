const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_PRIMARY = 'anthropic';
const DEFAULT_FALLBACK = 'openai';
const DEFAULT_MODELS = Object.freeze({
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.6-terra',
});
const PROVIDERS = new Set(['anthropic', 'openai']);
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,99}$/;
const SCHEMA_NAME_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;
const DEFAULT_FALLBACK_RESERVE_MS = 12_000;
const DEFAULT_SESSION_DEADLINE_MS = 48_000;
const MIN_CALL_BUDGET_MS = 250;
const MAX_PROVIDER_CALLS = 2;

class TextProviderError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'TextProviderError';
    this.code = code;
    this.provider = details.provider || '';
    this.status = Number.isInteger(details.status) ? details.status : 0;
    this.retryable = details.retryable === true;
  }
}

function cleanText(value, maxLength = 200) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, maxLength)
    : '';
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.floor(parsed)))
    : fallback;
}

function providerName(value, fallback) {
  const normalized = cleanText(value, 20).toLowerCase();
  return PROVIDERS.has(normalized) ? normalized : fallback;
}

function configuredModel(provider, env = process.env) {
  const envName = provider === 'anthropic' ? 'ANTHROPIC_TEXT_MODEL' : 'OPENAI_TEXT_MODEL';
  const configured = cleanText(env[envName], 100);
  return MODEL_PATTERN.test(configured) ? configured : DEFAULT_MODELS[provider];
}

function configuredEffort(provider, env = process.env) {
  const envName = provider === 'anthropic'
    ? 'ANTHROPIC_TEXT_EFFORT'
    : 'OPENAI_TEXT_REASONING_EFFORT';
  const configured = cleanText(env[envName], 20).toLowerCase();
  return EFFORTS.has(configured) ? configured : 'medium';
}

function providerConfig(provider, env = process.env) {
  const anthropic = provider === 'anthropic';
  const keyName = anthropic ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const termsName = anthropic
    ? 'ANTHROPIC_PAID_DATA_TERMS_ACCEPTED'
    : 'OPENAI_PAID_DATA_TERMS_ACCEPTED';
  const key = cleanText(env[keyName], 512);
  return {
    name: provider,
    key,
    model: configuredModel(provider, env),
    effort: configuredEffort(provider, env),
    configured: Boolean(key) && env[termsName] === '1',
  };
}

function providerChain(env = process.env) {
  const primaryName = providerName(env.CELESTE_TEXT_PRIMARY, DEFAULT_PRIMARY);
  const fallbackRaw = cleanText(env.CELESTE_TEXT_FALLBACK, 20).toLowerCase();
  const fallbackName = fallbackRaw === 'none'
    ? ''
    : providerName(fallbackRaw, DEFAULT_FALLBACK);
  const names = [primaryName, fallbackName]
    .filter(Boolean)
    .filter((name, index, values) => values.indexOf(name) === index);
  return {
    primaryName,
    providers: names.map((name) => providerConfig(name, env)).filter((item) => item.configured),
  };
}

function hasConfiguredProvider(env = process.env) {
  return providerChain(env).providers.length > 0;
}

function standardizeSchema(value) {
  if (Array.isArray(value)) return value.map(standardizeSchema);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'minItems' || key === 'maxItems' || key === 'minLength' || key === 'maxLength') {
      continue;
    }
    if (key === 'type' && typeof raw === 'string') {
      output.type = raw.toLowerCase();
      continue;
    }
    output[key] = standardizeSchema(raw);
  }
  if (output.type === 'object') {
    const properties = output.properties && typeof output.properties === 'object'
      ? output.properties
      : {};
    output.properties = properties;
    output.required = Object.keys(properties);
    output.additionalProperties = false;
  }
  return output;
}

function schemaName(value) {
  const normalized = cleanText(value, 64).toLowerCase();
  return SCHEMA_NAME_PATTERN.test(normalized) ? normalized : 'celeste_response';
}

function buildAnthropicRequest(config, request) {
  return {
    model: config.model,
    max_tokens: Math.min(8_000, request.maxOutputTokens + 1_536),
    system: [{
      type: 'text',
      text: request.system,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{ role: 'user', content: [{ type: 'text', text: request.user }] }],
    output_config: {
      effort: config.effort,
      format: {
        type: 'json_schema',
        schema: request.schema,
      },
    },
  };
}

function buildOpenAIRequest(config, request) {
  return {
    model: config.model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: request.system }] },
      { role: 'user', content: [{ type: 'input_text', text: request.user }] },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: request.schemaName,
        strict: true,
        schema: request.schema,
      },
    },
    reasoning: { effort: config.effort },
    max_output_tokens: Math.min(8_000, request.maxOutputTokens + 1_536),
    store: false,
  };
}

function buildProviderRequest(config, request) {
  if (config.name === 'anthropic') {
    return {
      url: ANTHROPIC_ENDPOINT,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: buildAnthropicRequest(config, request),
    };
  }
  return {
    url: OPENAI_ENDPOINT,
    headers: {
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
    },
    body: buildOpenAIRequest(config, request),
  };
}

function retryableStatus(status) {
  return status === 402 || status === 408 || status === 429 || status >= 500;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeUsage(provider, payload) {
  const usage = payload && payload.usage && typeof payload.usage === 'object'
    ? payload.usage
    : {};
  if (provider === 'anthropic') {
    const uncachedInputTokens = nonNegativeInteger(usage.input_tokens);
    const cacheCreationInputTokens = nonNegativeInteger(usage.cache_creation_input_tokens);
    const cachedInputTokens = nonNegativeInteger(usage.cache_read_input_tokens);
    const inputTokens = uncachedInputTokens + cacheCreationInputTokens + cachedInputTokens;
    const outputTokens = nonNegativeInteger(usage.output_tokens);
    return {
      inputTokens,
      outputTokens,
      uncachedInputTokens,
      cacheCreationInputTokens,
      cachedInputTokens,
      reasoningTokens: nonNegativeInteger(
        usage.output_tokens_details && usage.output_tokens_details.thinking_tokens
      ),
      totalTokens: inputTokens + outputTokens,
    };
  }
  return {
    inputTokens: nonNegativeInteger(usage.input_tokens),
    outputTokens: nonNegativeInteger(usage.output_tokens),
    cachedInputTokens: nonNegativeInteger(
      usage.input_tokens_details && usage.input_tokens_details.cached_tokens
    ),
    reasoningTokens: nonNegativeInteger(
      usage.output_tokens_details && usage.output_tokens_details.reasoning_tokens
    ),
    totalTokens: nonNegativeInteger(usage.total_tokens),
  };
}

function parseJsonText(text, provider) {
  const candidate = typeof text === 'string' ? text.trim() : '';
  if (!candidate) {
    throw new TextProviderError('invalid_provider_response', { provider });
  }
  try {
    return JSON.parse(candidate);
  } catch (_error) {
    throw new TextProviderError('invalid_provider_response', { provider });
  }
}

function parseAnthropicResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TextProviderError('invalid_provider_response', { provider: 'anthropic' });
  }
  if (payload.stop_reason === 'refusal') {
    throw new TextProviderError('text_provider_blocked', { provider: 'anthropic' });
  }
  if (payload.stop_reason === 'max_tokens') {
    throw new TextProviderError('text_provider_truncated', { provider: 'anthropic' });
  }
  const text = (Array.isArray(payload.content) ? payload.content : [])
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
  return parseJsonText(text, 'anthropic');
}

function parseOpenAIResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TextProviderError('invalid_provider_response', { provider: 'openai' });
  }
  if (payload.status === 'incomplete') {
    const reason = payload.incomplete_details && payload.incomplete_details.reason;
    throw new TextProviderError(
      reason === 'content_filter'
        ? 'text_provider_blocked'
        : reason === 'max_output_tokens'
        ? 'text_provider_truncated'
        : 'invalid_provider_response',
      { provider: 'openai' }
    );
  }
  const content = (Array.isArray(payload.output) ? payload.output : [])
    .filter((item) => item && item.type === 'message' && Array.isArray(item.content))
    .flatMap((item) => item.content);
  if (content.some((item) => item && item.type === 'refusal')) {
    throw new TextProviderError('text_provider_blocked', { provider: 'openai' });
  }
  const text = content
    .filter((item) => item && item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('')
    .trim();
  return parseJsonText(text || payload.output_text, 'openai');
}

function providerTimeoutMs(env = process.env) {
  return boundedInteger(
    env.CELESTE_TEXT_PROVIDER_TIMEOUT_MS,
    DEFAULT_PROVIDER_TIMEOUT_MS,
    20,
    30_000
  );
}

function fallbackReserveMs(env = process.env) {
  return boundedInteger(
    env.CELESTE_TEXT_FALLBACK_RESERVE_MS,
    DEFAULT_FALLBACK_RESERVE_MS,
    20,
    20_000
  );
}

function remainingMs(deadlineAt, clock) {
  if (!Number.isFinite(deadlineAt)) return 0;
  return Math.max(0, Math.floor(deadlineAt - clock()));
}

async function fetchProvider(config, request, timeoutBudget) {
  if (typeof fetch !== 'function') {
    throw new TextProviderError('text_provider_unavailable', {
      provider: config.name,
      retryable: true,
    });
  }
  const outgoing = buildProviderRequest(config, request);
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TextProviderError('text_provider_timeout', {
        provider: config.name,
        retryable: true,
      }));
    }, timeoutBudget);
  });
  try {
    let response;
    try {
      response = await Promise.race([
        fetch(outgoing.url, {
          method: 'POST',
          headers: outgoing.headers,
          body: JSON.stringify(outgoing.body),
          signal: controller.signal,
        }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof TextProviderError) throw error;
      throw new TextProviderError(
        error && error.name === 'AbortError' ? 'text_provider_timeout' : 'text_provider_unavailable',
        { provider: config.name, retryable: true }
      );
    }

    if (!response || !response.ok) {
      const status = Number.isInteger(response && response.status) ? response.status : 0;
      throw new TextProviderError('text_provider_unavailable', {
        provider: config.name,
        status,
        retryable: retryableStatus(status),
      });
    }
    let payload;
    try {
      payload = await Promise.race([response.json(), timeout]);
    } catch (error) {
      if (error instanceof TextProviderError) throw error;
      throw new TextProviderError('invalid_provider_response', { provider: config.name });
    }
    const data = config.name === 'anthropic'
      ? parseAnthropicResponse(payload)
      : parseOpenAIResponse(payload);
    return { data, usage: normalizeUsage(config.name, payload) };
  } finally {
    clearTimeout(timer);
  }
}

function emitUsageEvent(event) {
  if (!process.env.VERCEL_ENV && process.env.CELESTE_TEXT_LOG_USAGE !== '1') return;
  const safe = {
    event: event.event,
    operation: cleanText(event.operation, 40),
    provider: cleanText(event.provider, 20),
    model: cleanText(event.model, 100),
    fallbackUsed: event.fallbackUsed === true,
    status: Number.isInteger(event.status) ? event.status : 0,
    code: cleanText(event.code, 60),
    ...(event.usage ? { usage: event.usage } : {}),
  };
  console.info(JSON.stringify(safe));
}

function createSession({ deadlineAt, clock = () => Date.now(), maxCalls = MAX_PROVIDER_CALLS } = {}) {
  const sessionClock = typeof clock === 'function' ? clock : () => Date.now();
  if (deadlineAt !== undefined && !Number.isFinite(deadlineAt)) {
    throw new TextProviderError('invalid_text_provider_deadline');
  }
  const effectiveDeadlineAt = deadlineAt === undefined
    ? sessionClock() + DEFAULT_SESSION_DEADLINE_MS
    : deadlineAt;
  const chain = providerChain();
  const callLimit = boundedInteger(maxCalls, MAX_PROVIDER_CALLS, 1, MAX_PROVIDER_CALLS);
  let calls = 0;

  function remainingCalls() {
    return Math.max(0, callLimit - calls);
  }

  async function generate(request, options = {}) {
    const normalizedRequest = {
      operation: cleanText(request && request.operation, 40) || 'text',
      system: cleanText(request && request.system, 80_000),
      user: cleanText(request && request.user, 80_000),
      schema: standardizeSchema(request && request.schema),
      schemaName: schemaName(request && request.schemaName),
      maxOutputTokens: boundedInteger(
        request && request.maxOutputTokens,
        2_000,
        256,
        6_000
      ),
    };
    if (!normalizedRequest.system || !normalizedRequest.user || !normalizedRequest.schema) {
      throw new TextProviderError('invalid_text_provider_request');
    }
    const preferred = cleanText(options.provider, 20).toLowerCase();
    const candidates = preferred
      ? chain.providers.filter((provider) => provider.name === preferred)
      : chain.providers;
    if (!candidates.length) throw new TextProviderError('text_provider_not_configured');

    let lastError;
    for (let index = 0; index < candidates.length; index += 1) {
      if (remainingCalls() < 1) {
        throw lastError || new TextProviderError('text_provider_attempt_limit');
      }
      const config = candidates[index];
      const hasOperationalFallback = !preferred && index < candidates.length - 1 && remainingCalls() > 1;
      const available = remainingMs(effectiveDeadlineAt, sessionClock);
      const reserved = hasOperationalFallback ? fallbackReserveMs() : 0;
      const budget = Math.min(providerTimeoutMs(), Math.max(0, available - reserved));
      if (budget < MIN_CALL_BUDGET_MS) {
        lastError = new TextProviderError('text_provider_timeout', {
          provider: config.name,
          retryable: true,
        });
        if (hasOperationalFallback) continue;
        throw lastError;
      }

      calls += 1;
      try {
        const result = await fetchProvider(config, normalizedRequest, budget);
        const fallbackUsed = config.name !== chain.primaryName;
        emitUsageEvent({
          event: 'celeste_text_success',
          operation: normalizedRequest.operation,
          provider: config.name,
          model: config.model,
          fallbackUsed,
          usage: result.usage,
        });
        return {
          data: result.data,
          provider: config.name,
          model: config.model,
          fallbackUsed,
          usage: result.usage,
        };
      } catch (error) {
        const safeError = error instanceof TextProviderError
          ? error
          : new TextProviderError('text_provider_unavailable', {
              provider: config.name,
              retryable: true,
            });
        lastError = safeError;
        emitUsageEvent({
          event: 'celeste_text_failure',
          operation: normalizedRequest.operation,
          provider: config.name,
          model: config.model,
          fallbackUsed: config.name !== chain.primaryName,
          status: safeError.status,
          code: safeError.code,
        });
        if (!hasOperationalFallback || safeError.retryable !== true) throw safeError;
      }
    }
    throw lastError || new TextProviderError('text_provider_unavailable');
  }

  return {
    generate,
    remainingCalls,
    primaryProvider: chain.primaryName,
  };
}

module.exports = {
  TextProviderError,
  createSession,
  hasConfiguredProvider,
  providerChain,
  _internals: {
    buildAnthropicRequest,
    buildOpenAIRequest,
    normalizeUsage,
    parseAnthropicResponse,
    parseOpenAIResponse,
    retryableStatus,
    standardizeSchema,
    defaultSessionDeadlineMs: () => DEFAULT_SESSION_DEADLINE_MS,
  },
};

import OpenAI from 'openai';
import {
  getOpenAiChatModel,
  getOpenAiClassifierModel,
  resolveOpenAiApiKey
} from '../config/openai.js';

let openaiClient = null;
let activeOpenAiKeyFingerprint = null;

function buildOpenAiKeyError(code = 'OPENAI_API_KEY_MISSING') {
  const error = new Error(code);
  error.code = code;
  return error;
}

function getOpenAiClient() {
  const resolved = resolveOpenAiApiKey();
  if (!resolved.apiKey) {
    throw buildOpenAiKeyError();
  }

  const nextFingerprint = `${resolved.source || 'unknown'}:${resolved.apiKey}`;
  if (!openaiClient || activeOpenAiKeyFingerprint !== nextFingerprint) {
    openaiClient = new OpenAI({ apiKey: resolved.apiKey });
    activeOpenAiKeyFingerprint = nextFingerprint;
  }

  return openaiClient;
}

function geminiPartsToText(parts = []) {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .map(part => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function promptToText(prompt) {
  if (typeof prompt === 'string') return prompt;
  if (Array.isArray(prompt)) return geminiPartsToText(prompt);
  if (prompt?.contents && Array.isArray(prompt.contents)) {
    return prompt.contents
      .map(content => geminiPartsToText(content.parts))
      .filter(Boolean)
      .join('\n');
  }
  if (prompt?.parts) return geminiPartsToText(prompt.parts);
  return String(prompt || '');
}

function normalizeSchemaTypes(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(normalizeSchemaTypes);

  const normalized = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      normalized[key] = value.toLowerCase();
    } else {
      normalized[key] = normalizeSchemaTypes(value);
    }
  }
  return normalized;
}

function extractFunctionDeclarations(tools = []) {
  if (!Array.isArray(tools)) return [];

  return tools.flatMap(tool => {
    if (Array.isArray(tool?.functionDeclarations)) return tool.functionDeclarations;
    if (tool?.function?.name) return [tool.function];
    return [];
  });
}

function convertGeminiToolsToOpenAi(tools = []) {
  return extractFunctionDeclarations(tools)
    .filter(declaration => declaration?.name)
    .map(declaration => ({
      type: 'function',
      function: {
        name: declaration.name,
        description: declaration.description || '',
        parameters: normalizeSchemaTypes(declaration.parameters || {
          type: 'object',
          properties: {}
        })
      }
    }));
}

function buildToolChoice(toolConfig, openAiTools) {
  if (!Array.isArray(openAiTools) || openAiTools.length === 0) return undefined;

  const functionCallingConfig = toolConfig?.functionCallingConfig || {};
  const mode = String(functionCallingConfig.mode || 'AUTO').toUpperCase();
  if (mode === 'ANY') {
    const allowed = Array.isArray(functionCallingConfig.allowedFunctionNames)
      ? functionCallingConfig.allowedFunctionNames.filter(Boolean)
      : [];
    if (allowed.length === 1) {
      return {
        type: 'function',
        function: { name: allowed[0] }
      };
    }
    return 'required';
  }

  return 'auto';
}

function buildResponseFormat(generationConfig = {}) {
  const mimeType = generationConfig.responseMimeType || generationConfig.response_mime_type;
  return mimeType === 'application/json' ? { type: 'json_object' } : undefined;
}

function parseArguments(rawArgs) {
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object') return rawArgs;

  try {
    return JSON.parse(rawArgs);
  } catch {
    return {};
  }
}

function completionToGeminiResponse(completion) {
  const choice = completion?.choices?.[0] || {};
  const message = choice.message || {};
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  return {
    text: () => (typeof message.content === 'string' ? message.content : ''),
    functionCalls: () => toolCalls
      .filter(call => call?.type === 'function' && call?.function?.name)
      .map(call => ({
        name: call.function.name,
        args: parseArguments(call.function.arguments)
      })),
    usageMetadata: {
      promptTokenCount: completion?.usage?.prompt_tokens || 0,
      candidatesTokenCount: completion?.usage?.completion_tokens || 0
    },
    candidates: [{
      finishReason: String(choice.finish_reason || 'stop').toUpperCase()
    }]
  };
}

class OpenAiChatSession {
  constructor(model) {
    this.model = model;
    this.messages = [...model.initialMessages];
    this.lastToolCalls = [];
    this.usedToolCallIds = new Set();
  }

  appendToolResponses(payload) {
    for (const item of payload) {
      const functionResponse = item?.functionResponse || item;
      const name = functionResponse?.name;
      const response = functionResponse?.response ?? {};
      const matchingCall = this.lastToolCalls.find(call =>
        call?.function?.name === name && !this.usedToolCallIds.has(call.id)
      ) || this.lastToolCalls.find(call => !this.usedToolCallIds.has(call.id));

      if (!matchingCall?.id) {
        continue;
      }

      this.usedToolCallIds.add(matchingCall.id);
      this.messages.push({
        role: 'tool',
        tool_call_id: matchingCall.id,
        content: typeof response === 'string' ? response : JSON.stringify(response)
      });
    }
  }

  async sendMessage(payload) {
    if (typeof payload === 'string') {
      this.messages.push({ role: 'user', content: payload });
    } else if (Array.isArray(payload)) {
      this.appendToolResponses(payload);
    } else {
      this.messages.push({ role: 'user', content: promptToText(payload) });
    }

    const completion = await this.model.createCompletion(this.messages);
    const message = completion?.choices?.[0]?.message || {};
    const assistantMessage = {
      role: 'assistant',
      content: message.content || null
    };

    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      assistantMessage.tool_calls = message.tool_calls;
      this.lastToolCalls = message.tool_calls;
      this.usedToolCallIds = new Set();
    } else {
      this.lastToolCalls = [];
      this.usedToolCallIds = new Set();
    }

    this.messages.push(assistantMessage);

    return {
      response: completionToGeminiResponse(completion)
    };
  }
}

class OpenAiGenerativeModel {
  constructor(config = {}) {
    this.config = config;
    this.model = config.openAiModel || getOpenAiChatModel();
    this.client = getOpenAiClient();
    this.generationConfig = config.generationConfig || {};
    this.tools = convertGeminiToolsToOpenAi(config.tools);
    this.toolChoice = buildToolChoice(config.toolConfig, this.tools);
    this.responseFormat = buildResponseFormat(this.generationConfig);
    this.initialMessages = [];

    if (config.systemInstruction) {
      this.initialMessages.push({
        role: 'system',
        content: String(config.systemInstruction)
      });
    }
  }

  buildCompletionParams(messages) {
    const params = {
      model: this.model,
      messages,
      temperature: Number.isFinite(this.generationConfig.temperature)
        ? this.generationConfig.temperature
        : 0.7
    };

    const maxTokens = this.generationConfig.maxOutputTokens || this.generationConfig.max_tokens;
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
      params.max_tokens = maxTokens;
    }

    if (this.tools.length > 0) {
      params.tools = this.tools;
      params.tool_choice = this.toolChoice || 'auto';
    }

    if (this.responseFormat) {
      params.response_format = this.responseFormat;
    }

    return params;
  }

  async createCompletion(messages) {
    return await this.client.chat.completions.create(this.buildCompletionParams(messages));
  }

  startChat({ history = [] } = {}) {
    const session = new OpenAiChatSession(this);
    for (const item of history) {
      const role = item.role === 'model' ? 'assistant' : 'user';
      const content = geminiPartsToText(item.parts);
      if (content) {
        session.messages.push({ role, content });
      }
    }
    return session;
  }

  async generateContent(prompt) {
    const messages = [...this.initialMessages, {
      role: 'user',
      content: promptToText(prompt)
    }];
    const completion = await this.createCompletion(messages);

    return {
      response: completionToGeminiResponse(completion)
    };
  }
}

export class OpenAiGeminiCompatibleClient {
  getGenerativeModel(config = {}) {
    const responseMimeType = config.generationConfig?.responseMimeType || config.generationConfig?.response_mime_type;
    const isJsonClassifier = responseMimeType === 'application/json';
    return new OpenAiGenerativeModel({
      ...config,
      openAiModel: isJsonClassifier ? getOpenAiClassifierModel() : getOpenAiChatModel()
    });
  }
}

export function getOpenAiGeminiCompatibleClient() {
  return new OpenAiGeminiCompatibleClient();
}

export default {
  OpenAiGeminiCompatibleClient,
  getOpenAiGeminiCompatibleClient
};

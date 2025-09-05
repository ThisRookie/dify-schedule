// sdk/dify.js (ESM, Node 18+/20)
// 零依赖：使用原生 fetch 与 Web Streams 解析（兼容流式）
// 建议 DIFY_BASE_URL 形如 https://api.dify.ai/v1

export const BASE_URL = "https://api.dify.ai/v1";

export const routes = {
  //  app's
  feedback: {
    method: "POST",
    url: (message_id) => `/messages/${message_id}/feedbacks`,
  },
  application: {
    method: "GET",
    url: () => `/parameters`,
  },
  fileUpload: {
    method: "POST",
    url: () => `/files/upload`,
  },
  textToAudio: {
    method: "POST",
    url: () => `/text-to-audio`,
  },
  getMeta: {
    method: "GET",
    url: () => `/meta`,
  },

  // completion's
  createCompletionMessage: {
    method: "POST",
    url: () => `/completion-messages`,
  },

  // chat's
  createChatMessage: {
    method: "POST",
    url: () => `/chat-messages`,
  },
  getSuggested:{
    method: "GET",
    url: (message_id) => `/messages/${message_id}/suggested`,
  },
  stopChatMessage: {
    method: "POST",
    url: (task_id) => `/chat-messages/${task_id}/stop`,
  },
  getConversations: {
    method: "GET",
    url: () => `/conversations`,
  },
  getConversationMessages: {
    method: "GET",
    url: () => `/messages`,
  },
  renameConversation: {
    method: "POST",
    url: (conversation_id) => `/conversations/${conversation_id}/name`,
  },
  deleteConversation: {
    method: "DELETE",
    url: (conversation_id) => `/conversations/${conversation_id}`,
  },
  audioToText: {
    method: "POST",
    url: () => `/audio-to-text`,
  },

  // workflow‘s
  getWorkflowInfo: {
    method: "GET",
    url: () => `/info`,
  },
  runWorkflow: {
    method: "POST",
    url: () => `/workflows/run`,
  },
  stopWorkflow: {
    method: "POST",
    url: (task_id) => `/workflows/${task_id}/stop`,
  },
  getWorkflowResult: {
    method: "GET",
    url: (task_id) => `/workflows/run/${task_id}`,
  },
};

export class DifyClient {
  constructor(apiKey, baseUrl = BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || "").replace(/\/+$/, "");
    if (!this.baseUrl) throw new Error("DIFY_BASE_URL 为空");
    if (!this.baseUrl.endsWith("/v1")) {
      console.warn("⚠️ 建议 DIFY_BASE_URL 以 /v1 结尾，例如 https://api.dify.ai/v1");
    }
  }

  updateApiKey(apiKey) {
    this.apiKey = apiKey;
  }

async sendRequest(
  method,
  endpoint,
  data = null,
  params = null,
  stream = false,
  headerParams = {}
) {
  const headers = {
    Authorization: `Bearer ${this.apiKey}`,
    "Content-Type": "application/json",
    ...headerParams,
  };

  const url = new URL(this.baseUrl + endpoint);
  if (params && typeof params === "object") {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }

  const init = { method, headers };
  if (method !== "GET" && data !== null && data !== undefined) {
    if (headers["Content-Type"] === "multipart/form-data") {
      delete headers["Content-Type"];
      init.body = data; // FormData
    } else {
      init.body = JSON.stringify(data);
    }
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${url.pathname} 失败：${res.status} ${res.statusText}\n${text}`);
  }

  if (stream) {
    return { data: res.body }; // ReadableStream
  }

  const json = await res.json().catch(() => ({}));
  return { data: json };
}

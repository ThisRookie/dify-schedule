// sdk/dify.js  (ESM, Node 18+/20)
// Minimal zero-dependency client for Dify Workflow streaming.
// Usage in your code remains the same:
//   import { WorkflowClient } from '../sdk/dify.js'
//   const wf = new WorkflowClient(token, baseUrl)
//   await wf.info(user)
//   await wf.getWorkflowResult(inputs, user, true)

export class WorkflowClient {
  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || "").replace(/\/+$/, "");
    if (!this.baseUrl) throw new Error("DIFY_BASE_URL 为空");
    if (!this.baseUrl.endsWith("/v1")) {
      console.warn("⚠️ 建议 DIFY_BASE_URL 以 /v1 结尾，例如 https://api.dify.ai/v1");
    }
  }

  // ----- internal request helper -----
  async _request(method, path, { data = null, params = null, stream = false, headers = {} } = {}) {
    const url = new URL(this.baseUrl + path);
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }

    const h = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...headers
    };

    const init = { method, headers: h };
    if (method !== "GET" && data !== null && data !== undefined) {
      if (h["Content-Type"] === "multipart/form-data") {
        // 让 fetch 自动设置 boundary
        delete h["Content-Type"];
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
      // 返回 ReadableStream，供上层解析 SSE
      return { data: res.body };
    }
    const json = await res.json().catch(() => ({}));
    return { data: json };
  }

  // ----- public APIs you use -----

  // 有些部署未开放 /info，这里失败则兜底返回占位名
  async info(user = "dify-schedule") {
    try {
      const r = await this._request("GET", "/info", { params: { user } });
      // 统一成 { data: { name } } 的结构
      return { data: { name: r?.data?.name || r?.data?.data?.name || "Dify Workflow" } };
    } catch {
      return { data: { name: "Dify Workflow" } };
    }
  }

  // 触发运行（支持 streaming / blocking）
  run(inputs, user, isStream) {
    const payload = {
      inputs,
      response_mode: isStream ? "streaming" : "blocking",
      user
    };
    return this._request("POST", "/workflows/run", {
      data: payload,
      stream: isStream,
      headers: isStream ? { Accept: "text/event-stream" } : {}
    });
  }

  // 获取运行结果
  result(task_id) {
    return this._request("GET", `/workflows/run/${task_id}`);
  }

  // 上层使用的统一方法：当 isStream=true 时解析 SSE，结束后再去拿最终结果
  async getWorkflowResult(inputs = {}, user = "dify-schedule", isStream = true) {
    const res = await this.run(inputs, user, isStream);

    if (!isStream) {
      // 非流式：一次性返回
      const response = res.data;
      if (response?.code) {
        console.log("Dify 工作流执行失败", response.code, response.message);
        return Promise.reject(response.message);
      }
      return {
        text: response?.data?.outputs?.text || "",
        task_id: response?.task_id
      };
    }

    // —— 解析 SSE ——（res.data 为 ReadableStream）
    const readable = res.data;
    const reader = readable.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let task_id = "";

    const readAll = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trimEnd();
          buffer = buffer.slice(idx + 1);

          if (!line) continue;
          if (line.startsWith(":")) continue; // 心跳/注释

          if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();
            if (dataStr === "[DONE]") {
              // 等流真正结束（reader.done），再跳出循环
              continue;
            }
            try {
              const ev = JSON.parse(dataStr);
              // 尝试抓取 workflow_run_id
              if (ev?.workflow_run_id) task_id = ev.workflow_run_id;

              // 打一些进度日志（与你原逻辑对齐）
              if (!ev.event || ev.event === "error" || ev.status === 400) {
                console.log(`工作流输出错误code:${ev.code}`, ev.message);
              } else if (ev.event === "workflow_started" || ev.event === "tts_message") {
                console.log("工作流开始执行");
              } else if (ev.event === "node_started" || ev.event === "node_finished") {
                console.log("工作流node节点执行任务中");
              } else if (ev.event === "workflow_finished" || ev.event === "tts_message_end") {
                console.log("工作流执行完毕，正在组装数据进行发送");
              }
            } catch {
              // 非 JSON 事件，忽略或打印
              // console.log("[data]", dataStr);
            }
          }
        }
      }
    };

    console.log("进入Dify工作流，请耐心等待...");
    await readAll();

    // 流结束后，去拿最终结果
    const { data } = task_id ? await this.result(task_id) : { data: { outputs: "" } };
    console.log("获取工作流执行结果", task_id, JSON.stringify(data.outputs));
    let outputs = {};
    if (data.outputs) {
      try {
        outputs = typeof data.outputs === "string" ? JSON.parse(data.outputs) : data.outputs;
      } catch (e) {
        console.log(`获取工作流执行结果, 解析失败: ${e}`);
      }
    }
    return { text: outputs?.text, task_id };
  }
}

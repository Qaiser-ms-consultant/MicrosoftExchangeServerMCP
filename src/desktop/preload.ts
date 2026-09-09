const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("exchangeDesktop", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (content: string) => ipcRenderer.invoke("config:save", content),
  configPath: () => ipcRenderer.invoke("config:path"),
  listProviders: () => ipcRenderer.invoke("providers:list"),
  testProvider: (p: { provider: string; apiKey: string; baseUrl?: string }) => ipcRenderer.invoke("providers:test", p),
  startMcp: () => ipcRenderer.invoke("mcp:start"),
  stopMcp: () => ipcRenderer.invoke("mcp:stop"),
  runDoctor: (opts: { endpoint?: string; insecure?: boolean }) => ipcRenderer.invoke("doctor:run", opts),
  askExchange: (payload: { prompt: string; conversationId?: string; confirmed?: boolean; tool?: string; args?: any; systemPrompt?: string }) => ipcRenderer.invoke("exchange:ask", payload),
  isMcpRunning: () => ipcRenderer.invoke("mcp:isRunning"),
  getBackendInfo: () => ipcRenderer.invoke("backend:info"),
  updaterCheck: () => ipcRenderer.invoke("updater:check"),
  updaterUpdate: () => ipcRenderer.invoke("updater:update"),
  updaterRestart: () => ipcRenderer.invoke("updater:restart"),
  promptValidate: (prompt: string) => ipcRenderer.invoke("prompt:validate", { prompt }),
  promptEnhance: (prompt: string, useModel?: boolean) => ipcRenderer.invoke("prompt:enhance", { prompt, useModel }),
});

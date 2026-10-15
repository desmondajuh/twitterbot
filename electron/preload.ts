import { contextBridge, ipcRenderer } from "electron";
import {
  DiscoverCommentsOptions,
  LogMessage,
  ConfirmationRequest,
  ConfirmationDecision,
} from "../src/types/electron";
import { CreateJobInput, CommentDiscoveryResult, AutomationSettings } from "../src/types";

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  browser: {
    connect: () => ipcRenderer.invoke("browser:connect"),
    launchX: () => ipcRenderer.invoke("browser:launch-x"),
    disconnect: () => ipcRenderer.invoke("browser:disconnect"),
    getStatus: () => ipcRenderer.invoke("browser:status"),
  },
  automation: {
    discoverComments: (options: DiscoverCommentsOptions): Promise<CommentDiscoveryResult> =>
      ipcRenderer.invoke("automation:discoverComments", options),
    createReplyJob: (input: CreateJobInput) =>
      ipcRenderer.invoke("automation:createReplyJob", input),
    stopJob: (jobId: string) => ipcRenderer.invoke("automation:stopJob", jobId),
    getJob: (jobId: string) => ipcRenderer.invoke("automation:getJob", jobId),
    getAllJobs: () => ipcRenderer.invoke("automation:getAllJobs"),
    retryJob: (jobId: string) => ipcRenderer.invoke("automation:retryJob", jobId),
    deleteJob: (jobId: string) => ipcRenderer.invoke("automation:deleteJob", jobId),
    onStatusChange: (
      callback: (status: { jobId?: string; state: string; detail?: string }) => void
    ) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on("automation:status-change", handler);
      return () => {
        ipcRenderer.removeListener("automation:status-change", handler);
      };
    },
    onLog: (callback: (logMsg: LogMessage) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on("automation:log", handler);
      return () => {
        ipcRenderer.removeListener("automation:log", handler);
      };
    },
    onConfirmRequest: (callback: (request: ConfirmationRequest) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on("automation:confirm-request", handler);
      return () => {
        ipcRenderer.removeListener("automation:confirm-request", handler);
      };
    },
    respondConfirm: (confirmationId: string, decision: ConfirmationDecision) =>
      ipcRenderer.invoke("automation:confirm-response", { confirmationId, decision }),
  },
  settings: {
    getPaths: () => ipcRenderer.invoke("settings:getPaths"),
    getSettings: (): Promise<AutomationSettings> => ipcRenderer.invoke("settings:get"),
    updateSettings: (settings: Partial<AutomationSettings>): Promise<AutomationSettings> =>
      ipcRenderer.invoke("settings:update", settings),
    openFolder: (target: "logs" | "screenshots" | "userData" | "browserProfile"): Promise<boolean> =>
      ipcRenderer.invoke("settings:openFolder", target),
  },
});

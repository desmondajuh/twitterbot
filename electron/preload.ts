import { contextBridge, ipcRenderer } from "electron";
import {
  DiscoverCommentsOptions,
  LogMessage,
} from "../src/types/electron";
import { CreateJobInput, CommentDiscoveryResult } from "../src/types";

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
  },
  settings: {
    getPaths: () => ipcRenderer.invoke("settings:getPaths"),
  },
});

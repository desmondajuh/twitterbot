import { ipcMain } from "electron";
import { automationService } from "../services/automation-service";
import { DiscoverCommentsOptions, ConfirmationDecision } from "../../src/types/electron";
import { CreateJobInput } from "../../src/types";

export function registerAutomationIpc(): void {
  ipcMain.handle("automation:discoverComments", async (_event: any, options: DiscoverCommentsOptions) => {
    return automationService.discoverComments(options);
  });

  ipcMain.handle("automation:createReplyJob", async (_event: any, input: CreateJobInput) => {
    return automationService.createReplyJob(input);
  });

  ipcMain.handle("automation:stopJob", async (_event: any, jobId: string) => {
    return automationService.stopJob(jobId);
  });

  ipcMain.handle("automation:getJob", async (_event: any, jobId: string) => {
    return automationService.getJob(jobId);
  });

  ipcMain.handle("automation:getAllJobs", async () => {
    return automationService.getAllJobs();
  });

  ipcMain.handle("automation:retryJob", async (_event: any, jobId: string) => {
    return automationService.retryJob(jobId);
  });

  ipcMain.handle(
    "automation:confirm-response",
    async (_event: any, { confirmationId, decision }: { confirmationId: string; decision: ConfirmationDecision }) => {
      return automationService.handleConfirmResponse(confirmationId, decision);
    }
  );
}

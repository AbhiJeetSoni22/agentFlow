// index.ts
import dbConnect from "./db";
import { nodeAgent } from "./nodeAgent";
import dotenv from "dotenv";
import { BotFlow } from "../src/models";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { IExecutingBotFlow, IMesssage } from "./executingFlow.interface";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static(path.join(__dirname, "public")));

class ManualFlow {
  private flowId: string;
  private userId: string;
  private socket: any;

  constructor(flowId: string, userId: string, socket: any) {
    this.flowId = flowId;
    this.userId = userId;
    this.socket = socket;
  }

  public async run(initialQuery: string) {
    try {
      const uri = process.env.DB_URI as string;
      if (!uri) {
        this.socket.emit("botMessage", " Error: DB URI not found check the uri in the dotenv file.");
        return;
      }
      await dbConnect(uri);
      const flowObject = await BotFlow.findById(this.flowId);

      const flow: any[] = flowObject?.flow ?? [];
      if (flow.length === 0) {
        this.socket.emit("botMessage", " Error: No nodes found in flow recheck the execution.");
        return;
      }

      const executingFlowData = {
        flowName: flowObject?.flowName,
        flowDescription: flowObject?.flowDescription,
        companyId: flowObject?.companyId,
        messages: [{ message: initialQuery, owner: "User" }],
        userId: this.userId, 
        botId: flowObject?.botId,
        flowState: "start",
        nodes: [],
        variables: [],
      };

      const newExecutingFlow: IExecutingBotFlow = (await ExecutingBotFlow.create(executingFlowData)) as unknown as IExecutingBotFlow;
      this.socket.emit("botMessage", ` Flow started for query: ${initialQuery}`);

      let currentNode = flow[0];
      let nextNodeId: string | number | undefined;
      let currentQuery = initialQuery;

      while (true) {
        nextNodeId = await nodeAgent(currentNode, currentQuery, newExecutingFlow);

        if (nextNodeId === "PROMPT_REQUIRED") {
          const updatedFlow = await ExecutingBotFlow.findById(newExecutingFlow._id);
          if (updatedFlow && updatedFlow.messages?.length > 0) {
            const userPrompt = updatedFlow.messages[updatedFlow.messages.length - 1].message;
            this.socket.emit("promptRequired", userPrompt);

            currentQuery = await new Promise<string>((resolve) => {
              this.socket.once("userResponse", (answer: string) => {
                resolve(answer);
              });
            });

            const messageObject: IMesssage = { message: currentQuery, owner: "User" };
            await ExecutingBotFlow.findOneAndUpdate(
              { _id: newExecutingFlow._id },
              { $push: { messages: messageObject } },
              { new: true }
            );
          } else {
            this.socket.emit("botMessage", "❌ Error: Prompt not found in database.");
            break;
          }
          continue;
        } else if (typeof nextNodeId === "string") {
          const nextNode = flow.find((node) => node.userAgentName === nextNodeId);
          if (nextNode) {
            currentNode = nextNode;
            currentQuery = "";
          } else {
            this.socket.emit("botMessage", `Error: Next node not found with ID: ${nextNodeId}`);
            break;
          }
        } else {
          this.socket.emit("botMessage", `Workflow completed. Final output: ${nextNodeId}`);
          break;
        }
      }
    } catch (error: any) {
      this.socket.emit("botMessage", `Error in run method: ${error.message}`);
    }
  }
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("A user connected.");

  // Listen for the 'startFlow' event from the client
  socket.on("startFlow", (data) => {
    const { flowId, initialQuery, userId } = data;
    const manualFlow = new ManualFlow(flowId, userId, socket);
    manualFlow.run(initialQuery);
  });

  // Listen for 'userResponse' event from the client for prompts
  socket.on("userResponse", (response) => {
    console.log("User response received:", response);
    // The promise in the `run` method will now resolve with this response.
  });

  socket.on("disconnect", () => {
    console.log("User disconnected.");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
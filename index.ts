// index.ts
import dbConnect from "./db";
import { nodeAgent } from "./nodeAgent";
import dotenv from "dotenv";
import { BotFlow } from "../src/models";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { IExecutingBotFlow, IMesssage } from "./executingFlow.interface";
import WebSocket, { WebSocketServer } from "ws";
import { ObjectId } from "mongodb";

dotenv.config();

const wss = new WebSocketServer({ port: 8080 });

console.log("WebSocket server started on port 8080");

wss.on("connection", async (ws) => {
    console.log("Client connected");

    const flowId = "68b5987f3cb5ad2a4deb861f";
    const userId = "dummyUserId";
    let executingFlowId: ObjectId | null = null;
    let initialQuerySent = false;

    const uri = process.env.DB_URI as string;
    if (!uri) {
        console.log("uri not found");
        ws.send(JSON.stringify({ type: "error", message: "Database URI not configured." }));
        ws.close();
        return;
    }
    await dbConnect(uri);

    ws.on("message", async (message) => {
        const messageString = message.toString();
        console.log("Received message:", messageString);

        try {
            if (!initialQuerySent) {
                const initialQuery = messageString;
                initialQuerySent = true;
                const flowObject = await BotFlow.findById(flowId);

                if (!flowObject || !flowObject.flow || flowObject.flow.length === 0) {
                    ws.send(JSON.stringify({ type: "error", message: "Bot flow not found or is empty." }));
                    ws.close();
                    return;
                }
                const flow: any[] = flowObject.flow;

                const executingFlowData = {
                    flowName: flowObject.flowName,
                    flowDescription: flowObject.flowDescription,
                    companyId: flowObject.companyId,
                    messages: [{ message: initialQuery, owner: "User" }],
                    userId: userId,
                    botId: flowObject.botId,
                    flowState: "start",
                    nodes: [],
                    variables: [],
                };

                const newExecutingFlow = (await ExecutingBotFlow.create(executingFlowData));
                executingFlowId = newExecutingFlow._id as ObjectId;

                let currentNode = flow[0];
                let nextNodeId: string | number | undefined;
                let currentQuery = initialQuery;

                while (true) {
                    const currentExecutingFlowDoc = await ExecutingBotFlow.findById(executingFlowId);
                    if (!currentExecutingFlowDoc) {
                        ws.send(JSON.stringify({ type: "error", message: "Executing flow not found in database." }));
                        return;
                    }
                    
                    // Pass the Mongoose document directly
                    nextNodeId = await nodeAgent(currentNode, currentQuery, currentExecutingFlowDoc as unknown as IExecutingBotFlow);
                    
                    const updatedFlow = await ExecutingBotFlow.findById(executingFlowId);

                    if (nextNodeId === "PROMPT_REQUIRED") {
                        if (updatedFlow && updatedFlow.messages?.length > 0) {
                            const userPrompt = updatedFlow.messages[updatedFlow.messages.length - 1].message;
                            ws.send(JSON.stringify({ type: "prompt", message: userPrompt }));
                            break;
                        } else {
                            ws.send(JSON.stringify({ type: "error", message: "Error: Prompt not found." }));
                            break;
                        }
                    } else if (typeof nextNodeId === "string") {
                        const nextNode = flow.find((node) => node.userAgentName === nextNodeId);
                        if (nextNode) {
                            currentNode = nextNode;
                            currentQuery = "";
                        } else {
                            ws.send(JSON.stringify({ type: "error", message: `Error: Next node not found with ID: ${nextNodeId}` }));
                            break;
                        }
                    } else {
                        const finalMessage = updatedFlow?.messages[updatedFlow.messages.length - 1].message || `Workflow completed with final output: ${nextNodeId}`;
                        ws.send(JSON.stringify({ type: "completion", message: finalMessage }));
                        break;
                    }
                }
            } else {
                const userResponse = messageString;
                const updatedFlowDoc = await ExecutingBotFlow.findById(executingFlowId);
                if (!updatedFlowDoc) {
                    ws.send(JSON.stringify({ type: "error", message: "Executing flow not found." }));
                    return;
                }
                
                const messageObject: IMesssage = { message: userResponse, owner: "User" };
                updatedFlowDoc.messages?.push(messageObject);
                await updatedFlowDoc.save();

                const flowObject = await BotFlow.findById(flowId);
                const flow: any[] = flowObject?.flow ?? [];
                
                let currentNode = flow.find((node) => node.userAgentName === updatedFlowDoc.nodes[updatedFlowDoc.nodes.length - 1].userAgentName);

                if (!currentNode) {
                    ws.send(JSON.stringify({ type: "error", message: "Current node not found." }));
                    return;
                }
                
                let nextNodeId: string | number | undefined;
                let currentQuery = userResponse;
                
                while (true) {
                    const currentExecutingFlowDoc = await ExecutingBotFlow.findById(executingFlowId);
                    if (!currentExecutingFlowDoc) {
                        ws.send(JSON.stringify({ type: "error", message: "Executing flow not found in database." }));
                        return;
                    }
                    
                    // Pass the Mongoose document directly
                    nextNodeId = await nodeAgent(currentNode, currentQuery, currentExecutingFlowDoc as unknown as IExecutingBotFlow);
                    
                    const finalUpdatedFlow = await ExecutingBotFlow.findById(executingFlowId);
                    
                    if (nextNodeId === "PROMPT_REQUIRED") {
                         if (finalUpdatedFlow && finalUpdatedFlow.messages?.length > 0) {
                            const userPrompt = finalUpdatedFlow.messages[finalUpdatedFlow.messages.length - 1].message;
                            ws.send(JSON.stringify({ type: "prompt", message: userPrompt }));
                            break;
                        } else {
                            ws.send(JSON.stringify({ type: "error", message: "Error: Prompt not found." }));
                            break;
                        }
                    } else if (typeof nextNodeId === "string") {
                        const nextNode = flow.find((node) => node.userAgentName === nextNodeId);
                        if (nextNode) {
                            currentNode = nextNode;
                            currentQuery = "";
                        } else {
                            ws.send(JSON.stringify({ type: "error", message: `Error: Next node not found with ID: ${nextNodeId}` }));
                            break;
                        }
                    } else {
                        const finalMessage = finalUpdatedFlow?.messages[finalUpdatedFlow.messages.length - 1].message || `Workflow completed with final output: ${nextNodeId}`;
                        ws.send(JSON.stringify({ type: "completion", message: finalMessage }));
                        break;
                    }
                }
            }
        } catch (error: any) {
            console.error("Error during message processing:", error);
            ws.send(JSON.stringify({ type: "error", message: `An error occurred: ${error.message}` }));
        }
    });

    ws.on("close", () => {
        console.log("Client disconnected");
    });
});
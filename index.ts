import dbConnect from "./db";
import { nodeAgent } from "./nodeAgent";

import dotenv from "dotenv";
import { BotFlow } from "../src/models";

import { AvailableTool } from "./types";
import { ExecutingBotFlow } from "./executingFlow.schema";
import { IExecutingBotFlow } from "./executingFlow.interface";
/* hame tools ko fetch nahe karna hai flowId ke base per hamare pass botFlow collection me flow object ke andar, avalibale function ke andar uss tool ke id milige uss id ke base per hum uss tool ko Tools collection se fetch karenge or usko toolExecutor me bhej denge phir 
phir tool Executor botState banaye ga or query se parameters exract karke botState me save karayega. 
*/
dotenv.config();
// Run tests
async function main(flowId: string, query: string) {
  try {
    const uri = process.env.DB_URI as string;
    if (!uri) {
      console.log("uri not found");
    }
    await dbConnect(uri);
    const flowObject = await BotFlow.findById(flowId);
    let flow: any[] = flowObject?.flow ?? [];
    if (flow.length === 0) {
      console.log("⚠️ No nodes found in flow");
      return;
    } // creating state for the  executng flow data res of the fields remain null 

    const executingFlowData = {
      flowName: flowObject?.flowName,
      flowDescription: flowObject?.flowDescription,
      companyId: flowObject?.companyId,
      botId: flowObject?.botId,
      flowState: "start", 
      flow: flowObject?.flow.map((node) => ({
        userAgentName: node.userAgentName,
        condition: node.condition, 
        availableFunctions: [
          {
            function: {
              funId: node.availableFunctions?.[0],
              funName: node.availableFunctions?.[1],
              parameters: [null],
              toolConfig: null,
            },
          },
        ],
      })),
    }; 

  
const newExecutingFlow: IExecutingBotFlow = (await ExecutingBotFlow.create(executingFlowData)) as IExecutingBotFlow;
    console.log("✅ ExecutingBotFlow document created successfully!");
    console.log("New document ID:", newExecutingFlow._id);
    let currentNode = flow[0];
    let nextNodeId: string | number;

    nextNodeId = await nodeAgent(currentNode, query, newExecutingFlow);
    // while (true) {
    //   nextNodeId = nodeAgent(currentNode,query,availableTools);
    //   console.log("Current Agent:", currentNode.displayAgentName);
    //   console.log("Execution nextNodeId:", nextNodeId);

    //   if (typeof nextNodeId === "string") {
    //     const nextNode = flow.find((node) => node.userAgentName === nextNodeId);
    //     if (nextNode) {
    //       console.log(
    //         "➡️ Transitioning to next node:",
    //         nextNode.displayAgentName
    //       );
    //       currentNode = nextNode;
    //     } else {
    //       console.error("❌ Error: Next node not found with ID:", nextNodeId);
    //       break;
    //     }
    //   } else {
    //     console.log("✅ Workflow completed. Final output:", nextNodeId);
    //     break; // Exit the loop
    //   }
    // }
  } catch (error: any) {
    console.log("error in main function", error.message);
  }
}

main("68a97ef9b953c4767e977052", "i want to sum 10 and 20");

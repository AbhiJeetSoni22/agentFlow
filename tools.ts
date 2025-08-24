import { BotFlow } from "../src/models";
import { AvailableTools } from "./types";
import { ToolModel } from "../src/models"
export class Tools  {
  static sum(a: number , b: number ): number {
    return a + b;
  }

  static multiply(a: number , b: number ): number {
    return a * b;
  }

  static division(a: number , b: number ): number {
    if (b === 0) {
      throw new Error("Division by zero is not allowed.");
    }
    return a / b;
  }
}

export async function fetAvailableTools(flowId:string){
   try {
    console.log(flowId)
      const doc = await BotFlow.findById(flowId,{botId:1}).lean()
const botId = doc?.botId;

    const tools = await ToolModel.find({botId},{_id:1,toolName:1}).lean()
    const availableTools: AvailableTools[] = tools.map((tool: any) => ({
      toolId: tool._id.toString(),
      toolName: tool.toolName
    }));
    
    return availableTools;
   } catch (error) {
      console.log('error during fetching avaliable tools for the botId')
   }
}

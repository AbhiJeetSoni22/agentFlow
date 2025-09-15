import { CrmDataModel, ToolModel } from "../../models";
import { Tool } from "../../interfaces/tool.interface";

// Operations ko define karte hain
const operations: Record<string, (args: any) => number> = {
  Sum: (args: any) => Number(args.a) + Number(args.b),
  Multiple: (args: any) => Number(args.c) * Number(args.d),
  Division: (args: any) => Number(args.e) / Number(args.f),
  Subtract: (args: any) => Number(args.g) - Number(args.h),
  Mod: (args: any) => Number(args.i) % Number(args.j),
};

export async function executeApiTool(
  tool: Tool,
  args: any,
  endUserId: string
): Promise<number | undefined | string> {
  if (!tool || !args) {
    console.error(" Error: Tool or arguments are missing.");
    return undefined;
  }
  const toolName = tool.toolName;

  if (typeof toolName !== "string" || !(toolName in operations)) {
    console.error(` Unknown or invalid tool: ${toolName}`);
    return undefined;
  }
  console.log(`Executing tool: ${toolName} for user: ${endUserId}`);
  console.log(`Arguments received:`, args);

  const operation = operations[toolName];
  const result = operation(args);

  console.log(`✅ Tool execution result: ${result}`);

  return result;
}

export async function executeCrmTool(
  tool: Tool,
  args: any,
  endUserId: string
): Promise<number | undefined | string> {
  if (!tool || !args) {
    console.error(" Error: Tool or arguments are missing.");
    return undefined;
  }
  const saveData = CrmDataModel.create({
    toolName: tool.toolName,
    toolId: tool._id,
    parameters: args,
    companyId: tool.companyId,
    botId: tool.botId,
    endUserId,
  });
  const result = JSON.stringify(args);
  return result;
}

export async function executeToolById(
  toolId: string,
  args: any,
  endUserId: string
): Promise<number | undefined | string> {
  try {
    const tool = await ToolModel.findById(toolId).lean();
    if (!tool) {
      console.error(` Error: Tool not found with ID: ${toolId}`);
      return "Error: Tool not found";
    }

    switch (tool.toolType) {
      case "API":
        return await executeApiTool(tool as unknown as Tool, args, endUserId);
      case "CRM":
        return await executeCrmTool(tool as unknown as Tool, args, endUserId);
      default:
        return undefined;
    }
  } catch (error) {
    console.error("Error in executeToolById:", error);
    return "Error";
  }
}

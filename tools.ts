import { ToolModel } from "../src/models";
export class Tools {
  static sum(a: number, b: number): number {
    return a + b;
  }

  static multiply(a: number, b: number): number {
    return a * b;
  }

  static division(a: number, b: number): number {
    if (b === 0) {
      throw new Error("Division by zero is not allowed.");
    }
    return a / b;
  }

  static subtract(a: number, b: number): number {
    return a - b;
  }

  static mod(a: number, b: number): number {
    if (b === 0) {
      throw new Error("Modulus by zero is not allowed check the variable  values and give correct values.");
    }
    return a % b;
  }
}

export async function fetchAvailableTool(toolId: string) {
  try {
    const availableTool = await ToolModel.findById({ _id: toolId }).lean();
    return availableTool;
  } catch (error) {
    console.log("error during fetching available tools for the botId check the toolId properly");
  }
}

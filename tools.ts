import { ToolModel } from "../../models";
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
    return Math.round(a / b);
  }

  static subtract(a: number, b: number): number {
    return a - b;
  }

  static mod(a: number, b: number): number {
    if (b === 0) {

      throw new Error("Modulus by zero is not allowed.");
    }
    return a % b;
  }
}

export async function fetchAvailableTool(toolId: string) {
  try {
    const availableTool = await ToolModel.findById({ _id: toolId }).lean();
    console.log("available function is", availableTool);

    return availableTool;
  } catch (error) {
    
    console.log("error during fetching avaliable tools for the botId");
  }
}

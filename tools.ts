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

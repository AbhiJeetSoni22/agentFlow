interface IAvailable{
  funId: string;
  funName: string
}
export interface FlowNode {
  agentName: string;
  displayAgentName: string;
  userAgentName: string;
  output: number;
  agentPrompt: string;
  agentModel: string;
  hardCodeFunction?: string | null;
  grabFunctionFrom?: string | null;
  availableFunctions: IAvailable[];
  condition: any[];
  _id?: string;
}

interface ObjectId {
  $oid: string;
}

interface Parameter {
  key: string;
  validation: string;
  _id: ObjectId;
}

interface Header {
  key: string;
  value: string;
}

interface DynamicParam {
  key: string;
  location: string;
  required: boolean;
  validation?: string;
}

interface ToolConfig {
  apiName: string;
  method: string;
  baseUrl: string;
  apiEndpoint: string;
  headers: Header[];
  dynamicParams: DynamicParam[];
  tools: any[]; // यदि tools की structure पता हो तो specific type दें
}

export interface AvailableTool {
  _id: ObjectId;
  toolName: string;
  toolDescription: string;
  parameters: Parameter[];
  companyId: string;
  botId: string;
  toolConfig: ToolConfig;
  toolType: string;
  __v: number;
}



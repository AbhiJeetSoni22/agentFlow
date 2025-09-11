
export interface Tool {
    _id: string; 
    toolName: string;
    toolDescription: string;
    parameters: Array<{
        key: string;
        validation: string;
        _id: string; 
    }>;
    companyId: string;
    botId: string;
    toolConfig: {
        apiName: string;
        method: string;
        baseUrl: string;
        apiEndpoint: string;
        headers: Array<{
            key: string;
            value: string;
        }>;
        dynamicParams: Array<{
            key: string;
            location: string;
            required: boolean;
            validation?: string;
        }>;
        tools: any[];
    };
    toolType: string;
    __v: number;
}
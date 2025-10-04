import { Response } from 'express';
import { AgentEntity } from "../entity/agentDefination.entity";
import { AgentFlowEntity } from '../entity/agentFlow.entity';
import { CustomRequest } from '../interfaces';
import { LoggerService, responseService } from '../services';

const agentFlowEntity = new AgentFlowEntity();
const agentEntity = new AgentEntity();
const logger = new LoggerService('AgentFlow Controller');

const FUNCTION_NAMES = {
  saveAgentFlowController: 'saveAgentFlowController',
  getAgentFlowController: 'getAgentFlowController',
  updateAgentFlowController: 'updateAgentFlowController',
  deleteAgentFlowController: 'deleteAgentFlowController',
  updateModelAndServiceController:'updateModelAndServiceController',
  getReactAgentFlowController:'getReactAgentFlowController'
};

// 📌 Add Agent Flow Controller
export const saveAgentFlowController = async (
  req: CustomRequest,
  res: Response
) => {
  try {
    const { flow, position, flowName, flowDescription, reactAgent } = req.body;
    const { agentId, type } = req.query;
    const companyId = req.companyId;

    if (!agentId || !companyId) {
      return responseService.error(
        res,
        400,
        "Invalid Credentials: agentId and companyId are required"
      );
    }
    console.log("flow  type ", type);

    const checkValidAgentId = await agentEntity.getAgentDefination({ agentId });
    if (!checkValidAgentId) {
      return responseService.error(res, 400, "Invalid AgentId");
    }

    if (type === 'NODE_RED') {
      if (!flow) {
        return responseService.error(res, 400, 'Invalid Credentials: flow is required');
      }
      const result = await agentFlowEntity.saveAgentFlow({ flow, position }, agentId as string, companyId, flowName as string, flowDescription as string);
      return responseService.success(res, { message: 'Agent Flow Saved Successfully', result });
    } else if (type === 'REACT') {
      if (!reactAgent) {
        return responseService.error(res, 400, 'Invalid Credentials: reactAgent is required');
      }
      const result = await agentFlowEntity.saveReactAgent(reactAgent, agentId as string, companyId, flow);
      return responseService.success(res, { message: 'React Agent Saved Successfully', result });
    } else {
      return responseService.error(res, 400, 'Invalid type');
    }
  } catch (error: any) {
    logger.error(FUNCTION_NAMES.saveAgentFlowController, error.message);
    return responseService.error(res, 400, error.message);
  }
};

export const getReactAgentFlowController = async (req: CustomRequest, res: Response) => {
  try {
    const {agentId} = req.params;
    if(!agentId){
       return responseService.error(res, 400, 'Invalid Credentials: agentId is required');
    }
    
    // Validate agentId
    const checkValidAgentId = await agentEntity.getAgentDefination({ agentId });
    if (!checkValidAgentId) {
      return responseService.error(res, 400, 'Invalid AgentId');
    }

    const result = await agentFlowEntity.getReactAgentFlows(agentId)
      if (!result) {
      return responseService.error(res, 404, 'Agent Flow not found');
    }
 return responseService.success(res, { message: 'React Agent Flow Fetched Successfully', result });
  } catch (error: any) {
    logger.error(FUNCTION_NAMES.getReactAgentFlowController, error.message);
    return responseService.error(res, 400, error.message);
  }
}

// 📌 Get Agent Flow Controller
export const getAgentFlowController = async (req: CustomRequest, res: Response) => {
  try {
    const { agentId } = req.params;
    const { action } = req.query as any

    if (!agentId) {
      return responseService.error(res, 400, 'Invalid Credentials: agentId is required');
    }

    // Validate agentId
    const checkValidAgentId = await agentEntity.getAgentDefination({ agentId });
    if (!checkValidAgentId) {
      return responseService.error(res, 400, 'Invalid AgentId');
    }

    const result = await agentFlowEntity.getAgentFlow(agentId as string, action);
    if (!result) {
      return responseService.error(res, 404, 'Agent Flow not found');
    }

    return responseService.success(res, { message: 'Agent Flow Fetched Successfully', result });
  } catch (error: any) {
    logger.error(FUNCTION_NAMES.getAgentFlowController, error.message);
    return responseService.error(res, 400, error.message);
  }
};

// 📌 Update Agent Flow Controller
export const updateAgentFlowController = async (req: CustomRequest, res: Response) => {
  try {
    const { flow, position, flowName, flowDescription, reactAgent } = req.body;
    const { agentId, type } = req.query;
    let result: any

    if (!agentId || !flow) {
      return responseService.error(res, 400, 'Invalid Credentials: agentId and flow are required');
    }

    // Validate agentId
    const checkValidAgentId = await agentEntity.getAgentDefination({ agentId });
    if (!checkValidAgentId) {
      return responseService.error(res, 400, 'Invalid AgentId');
    }
    if (type === 'NODE_RED') {
      result = await agentFlowEntity.updateAgentFlow({ flow, position, flowName, flowDescription, reactAgent }, agentId as string);
    } else if (type === 'REACT') {
      result = await agentFlowEntity.updateReactAgent({ flow, position, flowName, flowDescription, reactAgent }, agentId as string);
    } else {
      return responseService.error(res, 400, 'Invalid type');
    }

    if (!result) {
      return responseService.error(res, 404, 'Agent Flow not found');
    }

    return responseService.success(res, { message: 'Agent Flow Updated Successfully', result });
  } catch (error: any) {
    logger.error(FUNCTION_NAMES.updateAgentFlowController, error.message);
    return responseService.error(res, 400, error.message);
  }
};

// Update LLM model and LLM service Controller
export const updateModelAndServiceController = async (req: CustomRequest, res: Response) => {
  try {
    
    const {llmModel,llmService}= req.body;
    const {agentId,type} = req.query;
      if (!agentId || !llmModel || !llmService) {
      return responseService.error(res, 400, ' agentId, llmService and llmModel are required');
    }
  
    let result = await agentFlowEntity.updateModelAndService(agentId as string, type as string, llmModel, llmService);
      if (!result) {
      return responseService.error(res, 404, 'Agent Flow not found');
    }
      return responseService.success(res, { message: 'Agent Flow Updated Successfully', result });
  }catch (error: any) {
    logger.error(FUNCTION_NAMES.updateModelAndServiceController, error.message);
    return responseService.error(res, 400, error.message);
  }
}
// 📌 Delete Agent Flow Controller
export const deleteAgentFlowController = async (req: CustomRequest, res: Response) => {
  try {
    const { agentId } = req.query;

    if (!agentId) {
      return responseService.error(res, 400, 'Invalid Credentials: agentId is required');
    }

    // Validate agentId
    const checkValidAgentId = await agentEntity.getAgentDefination({ agentId });
    if (!checkValidAgentId) {
      return responseService.error(res, 400, 'Invalid AgentId');
    }

    const result = await agentFlowEntity.deleteAgentFlow(agentId as string);
    if (result.deletedCount === 0) {
      return responseService.error(res, 404, 'Agent Flow not found');
    }

    return responseService.success(res, { message: 'Agent Flow Deleted Successfully', result });
  } catch (error: any) {
    logger.error(FUNCTION_NAMES.deleteAgentFlowController, error.message);
    return responseService.error(res, 400, error.message);
  }
};

export const toggleFLowState = async (req: CustomRequest, res: Response) => {
  try {
    const { flowId } = req.params;
    const { state } = req.body;

    if (!flowId) {
      return responseService.error(res, 400, 'Invalid Credentials: flowId is required');
    }


    const result = await agentFlowEntity.toggleAgentFLowState(state, flowId as string);
    return responseService.success(res, { message: 'Agent Flow State Updated Successfully', result });
  } catch (error: any) {
    logger.error(FUNCTION_NAMES.deleteAgentFlowController, error.message);
    return responseService.error(res, 400, error.message);
  }
};

export const getSpecificAccountFlow = async (req: Request, res: Response) => {
  try {
    const result = await agentFlowEntity.getSpecificAccountFlow();
    return responseService.success(res, { message: "Flows fetched successfully", result });
  }
  catch (error: any) {
    logger.error("getSpecificAccountFlow", error.message);
    return responseService.error(res, 400, error.message);
  }
};
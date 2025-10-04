import mongoose from 'mongoose';
import { IAgentFLow } from '../interfaces';
import { AgentFlow } from '../models';
import { BaseEntity } from './base.entity';

export class AgentFlowEntity extends BaseEntity<IAgentFLow> {
  constructor() {
    super(AgentFlow);
  }

  public async saveAgentFlow(data: Partial<IAgentFLow>, agentId: string, companyId: string, flowName: string, flowDescription: string) {
    try {
      const flow = data.flow || [];

      // 🔍 Validate condition fields
      for (const agent of flow) {
        if (!agent.condition) continue;

        for (const cond of agent.condition) {
          if (cond.conditionType === "OnAgentAnswer" && !cond.answerFromUserAgentName) {
            throw new Error(`Missing 'answerFromUserAgentName' for conditionType "OnAgentAnswer" in agent: ${agent.userAgentName}`);
          }

          if (cond.conditionType === "OnAgentCompletion" && !cond.completionFromUserAgentName) {
            throw new Error(`Missing 'completionFromUserAgentName' for conditionType "OnAgentCompletion" in agent: ${agent.userAgentName}`);
          }
        }
      }

      const agentFlowData = {
        flow,
        flowName,
        flowDescription,
        companyId,
        agentId,
        position: data.position,
        flowState: data.flowState || "DRAFT",
        flowType: "NODE_RED", // Assuming default flowType is NODE_RED
      };

      const saveAgentFlow = await this.create(agentFlowData);
      return saveAgentFlow;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public async saveReactAgent(reactAgent: any, agentId: string, companyId: string, flow: any[]) {
    try {
      if (!reactAgent) {
        throw new Error('reactAgent is required');
      }
      if (!agentId) {
        throw new Error('agentId is required');
      }
      if (!companyId) {
        throw new Error('companyId is required');
      }
      const reactAgentData = {
        flow: flow || [],
        reactAgent,
        agentId,
        companyId,
        flowType: 'REACT',
      };


      const savedReactAgent = await this.create(reactAgentData);
      console.log(savedReactAgent, 'savedReactAgent');
      return savedReactAgent;
    } catch (error: any) {
      console.error('Error during save:', error.message)
      throw new Error(error.message);
    }
  }

  public async getReactAgentFlows(agentId:string){
   try {
    const reactAgentFlows = await this.find({agentId:agentId,flowType:"REACT"},{_id:1,reactAgent:{reactAgentName:1}});
    return reactAgentFlows;

   } catch (error: any) {
      throw new Error(error.message);
    }
  }
  public async getAgentFlow(agentId: string, action: string) {
    try {
      if (action === "ONE") {
        const findAgentFlow = await this.findOne({ agentId: agentId, flowState: "PUBLISH" });
        return findAgentFlow;
      } else {
        const findAgentFlow = await this.find({ agentId: agentId });
        return findAgentFlow;
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public async deleteAgentFlow(agentId: string) {
    try {
      const deleteAgentFlow = await this.deleteOne({ agentId });
      return deleteAgentFlow;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public async updateAgentFlow(data: Partial<IAgentFLow>, agentId: string) {
    try {
      // Ensure only schema fields are updated
      const updateData = {
        flow: data.flow,
        position: data.position,
        flowState: data.flowState
      };
      const saveAgentFlow = await this.findOneAndUpdate({ agentId }, updateData, { new: true });
      return saveAgentFlow;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
  
  public async updateModelAndService(agentId:string,type:string,llmModel:string,llmService:string){
    try {
      let result:any
      if(!type || type == null){
        result = await AgentFlow.updateMany({agentId},{$set :{llmModel,llmService}});
      }
      else{

        result = await AgentFlow.updateMany({flowType:type,agentId},{$set:{llmModel,llmService}});
      }
      console.log('result is ',result)
      return result;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
  public async updateReactAgent(data: Partial<IAgentFLow>, agentId: string) {
    try {
      // Ensure only schema fields are updated
      const updateData = {
        flow: data?.flow,
        position: data?.position,
        flowState: data?.flowState,
        flowName: data?.flowName,
        flowDescription: data?.flowDescription,
        reactAgent: data?.reactAgent,
        llmService:data?.llmService,
        llmModel:data?.llmModel
      };

      // First, update the intended flow
      const updatedAgentFlow = await this.findOneAndUpdate({ agentId }, updateData, { new: true });

      // Check if the update was successful and the state is now 'PUBLISH'
      if (updatedAgentFlow && updatedAgentFlow.value?.flowState === 'PUBLISH') {
        // If so, set all other flows for this agentId to 'DRAFT'
        await AgentFlow.updateMany(
          {
            agentId: agentId,
            _id: { $ne: updatedAgentFlow.value._id } // $ne ensures we don't update the one we just published
          },
          { $set: { flowState: 'DRAFT' } }
        );
      }

      return updatedAgentFlow;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public async toggleAgentFLowState(state: string, flowId: any) {
    try {
      // Ensure only schema fields are updated
      const updateData = {
        flowState: state,
      };
      const updateFLowState = await this.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(flowId) },
        updateData,
        { new: true }
      );
      return updateFLowState;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  public async getSpecificAccountFlow() {
    try {
      const flows = await this.find({ companyId: "684d9e2558457385a6558653" });
      return flows;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }
}
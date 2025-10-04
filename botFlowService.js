// src/services/botFlowService.js
import axios from "../../../config/axios";

const route = "/api/agentFLow";

export const sendToBotFlow = async ({
  flow,
  agentId,
  token,
  flowDetails,
  type = "NODE_RED",
  reactAgent,
}) => {
  if (type === "NODE_RED") {
    if (!flow || !agentId || !token) {
      console.log("Fields are empty", agentId, flow);
      return;
    } else {
      console.log(flow, agentId);
    }
  } else if (type === "REACT") {
    if (!reactAgent || !agentId || !token) {
      console.log("Fields are empty", agentId, reactAgent);
      return;
    } else {
      console.log(reactAgent, agentId);
    }
  }

  try {
    let payload;

    if (type === "REACT") {
      payload = {
        reactAgent, // send reactAgent
        agentId, // send agentId
        flow,
      };
    } else if (type === "NODE_RED") {
      payload = {
        flow: flow.flow,
        position: flow.position,
        flowName: flowDetails.flowName,
        flowDescription: flowDetails.flowDescription,
      };
    }

    const response = await axios.post(
      `${route}/?agentId=${agentId}&type=${type}`,
      payload,
      {
        headers: {
          "auth-token": token,
        },
      }
    );

    return response.data.result;
  } catch (error) {
    console.error("Error sending request:", error);
    throw error;
  }
};

export const updateBotFlow = async ({
  flow,
  agentId,
  flowId,
  token,
  type = "NODE_RED",
  reactAgent,
  flowDetails,
}) => {
  try {
    let payload;

    console.log();

    if (type === "REACT") {
      payload = {
        reactAgent, // send reactAgent
        flow,
      };
    } else if (type === "NODE_RED") {
      payload = {
        flow: flow.flow,
        position: flow.position,
        flowName: flowDetails.flowName,
        flowDescription: flowDetails.flowDescription,
      };
    }

    const response = await axios.put(`${route}/${flowId}`, payload, {
      params: {
        agentId: agentId,
        flowId: flowId,
        type: type,
      },
      headers: {
        "Content-Type": "application/json",
        "auth-token": token,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error updating bot flow:", error);
    throw error;
  }
};

export const fetchBotFlow = async ({ agentId, token }) => {
  try {
    const response = await axios.get(`${route}/${agentId}`, {
      params: {
        agentId: agentId,
      },
      headers: {
        "auth-token": token,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error in fetchBotFlow:", error);
    throw error;
  }
};

export const deleteBotFlow = async ({ agentId, token }) => {
  try {
    const response = await axios.delete(`${route}/${agentId}`, {
      headers: {
        "auth-token": token,
      },
    });

    return response.data;
  } catch (error) {
    // Handle error and throw a meaningful message
    throw new Error(
      error.response?.data?.message || "Failed to delete bot flow"
    );
  }
};

export const toggleFlowStateService = async ({ flowId, isActive, token }) => {
  try {
    const response = await axios.put(
      `${route}/toggleFlowState/${flowId}`,
      { state: isActive ? "PUBLISH" : "DRAFT" },
      {
        headers: {
          "auth-token": token,
        },
      }
    );

    if (!response.data.status) {
      throw new Error("Failed to toggle flow state");
    }

    return { success: true };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const triggerNodeRedFlow = async ({ flowId, agentId, token }) => {
  try {
    const response = await axios.post(
      "/api/nodeRed",
      {},
      {
        params: {
          agentId: agentId,
          flowId: flowId,
        },
        headers: {
          "auth-token": token,
        },
      }
    );

    console.log("Node-RED Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error triggering Node-RED flow:", error);
    throw error;
  }
};

export const fetchReactAgentFlow = async (agentId, token) => {
  try {
    const response = await axios.get(`${route}/getReactAgentFlows/${agentId}`, {
      headers: {
        "auth-token": token,
      },
    });
    return response.data.result;
  } catch (error) {
    console.error("Error fetching reactAgent flow:", error);
    throw error;
  }
};

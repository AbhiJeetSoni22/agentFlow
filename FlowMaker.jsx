import { errorToast, successToast } from "@/components/Utils/ShambhoToast";
import { NodeActionsProvider } from "@/context/NodeActionsContext";
import { useTheme } from "@/theme/ThemeContext";
import Tippy from "@tippyjs/react";
import dagre from 'dagre';
import { LayoutGrid, Loader2, LucideGitBranch } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import ReactFlow, {
    addEdge,
    Background,
    Controls,
    Panel,
    useEdgesState,
    useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import AgentToolbar from "./AgentToolbar";
import CustomEdge from "./CustomEdge";
import CustomNode from "./CustomNode";
import EdgeEditorSidebar from "./EdgeEditorSidebar";
import { FlowDetails } from "./FlowDetails";
import NodeEditorSidebar from "./NodeEditorSidebar";
import PasteModal from "./PasteModal";
import {
    sendToBotFlow,
    toggleFlowStateService,
    triggerNodeRedFlow,
    updateBotFlow
} from "./services/botFlowService";

const initialFlow = [
    {
        agentName: "Placeholder",
        output: 1,
        condition: []
    },
];

const nodeTypes = { customNode: CustomNode };
const edgeTypes = { customEdge: CustomEdge }

const FlowMaker = () => {

    const { colors, theme } = useTheme();
    const navigate = useNavigate()
    const location = useLocation();
    const token = localStorage.getItem("token");

    const aiAgentData = useSelector((state) => state.aiAgentDefinition)

    const [nodes, setNodes, onNodesChange] = useNodesState(
        initialFlow.map((agent, index) => ({
            id: agent.agentName,
            type: "customNode",
            data: {
                label: agent.agentName,
                agent: {
                    ...agent,
                    condition: agent.condition.map(() => ({
                        conditionType: "OnAgentCompletion",
                        conditionValue: undefined,
                        executeAgent: null,
                        executeUserAgent: null,
                        executed: false,
                        answerFromUserAgentName: null,
                        completionFromUserAgentName: null,
                    })),
                },
                deleteNode: null,
                onAddPlaceholder: null,
                onEditNode: null,
                onCopyNode: null,
                onPasteNode: null,
            },
            position: { x: 250, y: 200 * index },
        }))
    );
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [editingNode, setEditingNode] = useState(null);
    const [showEdgeSidebar, setShowEdgeSidebar] = useState(false);
    const [copiedNode, setCopiedNode] = useState(null);
    const [pasteNodeId, setPasteNodeId] = useState(null);
    const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
    const [selectedFlowId, setSelectedFlowId] = useState(null);
    const [savingFlow, setSavingFlow] = useState(false)
    const [flowDetails, setFlowDetails] = useState({
        flowName: '',
        flowDescription: ''
    })
    const [open, setOpen] = useState(false)
    const [nodeErrors, setNodeErrors] = useState([]);

    const createEmptyCondition = () => ({
        conditionType: "OnAgentCompletion",
        conditionValue: undefined,
        executeAgent: null,
        executeUserAgent: null,
        executed: false,
        answerFromUserAgentName: null,
        completionFromUserAgentName: null,
    });

    const arrangeNodesWithDagre = useCallback(() => {
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        // Set graph layout direction: 'LR' for left-to-right (horizontal tree)
        dagreGraph.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50 });

        // Define node dimensions (adjust based on your CustomNode size)
        const nodeWidth = 250; // Matches typical CustomNode width
        const nodeHeight = 150; // Matches typical CustomNode height

        // Add nodes to Dagre graph
        nodes.forEach((node) => {
            if (node.id) {
                dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
            } else {
                // console.warn("Skipping node with missing ID:", node);
            }
        });

        // Add edges to Dagre graph, validate source and target exist
        edges.forEach((edge) => {
            if (
                edge.source &&
                edge.target &&
                dagreGraph.hasNode(edge.source) &&
                dagreGraph.hasNode(edge.target)
            ) {
                dagreGraph.setEdge(edge.source, edge.target);
            } else {
                // console.warn("Skipping invalid edge:", edge);
            }
        });

        try {
            // Run Dagre layout
            dagre.layout(dagreGraph);

            // Update node positions
            setNodes((nds) =>
                nds.map((node) => {
                    const nodeWithPosition = dagreGraph.node(node.id);
                    if (!nodeWithPosition) {
                        console.warn(`No position computed for node: ${node.id}`);
                        return node; // Keep existing position if layout fails
                    }
                    return {
                        ...node,
                        position: {
                            x: nodeWithPosition.x - nodeWidth / 2, // Center the node
                            y: nodeWithPosition.y - nodeHeight / 2,
                        },
                    };
                })
            );
        } catch (error) {
            console.error("Dagre layout failed:", error);
            toast.error("Failed to arrange nodes. Please check the graph structure.");
        }
    }, [nodes, edges, setNodes]);

    const loadFlow = (flowData) => {
        const { flow, _id } = flowData;
        setFlowDetails({
            flowName: flowData.flowName,
            flowDescription: flowData.flowDescription
        })

        // Map flow to nodes (excluding potential start node in flow data)
        const flowNodes = flow
            .filter((agent) => agent.userAgentName !== "Start")
            .map((agent) => ({
                id: agent.userAgentName,
                type: "customNode",
                data: {
                    label: agent.userAgentName,
                    agent: {
                        ...agent,
                        displayAgentName: agent.displayAgentName || agent.agentName || "",
                        prompt: agent.agentPrompt || agent.prompt || "",
                        llmModel: agent.llmModel || "Meta-Llama-3.1-70B-Instruct",
                        hardCodeFunction: agent.hardCodeFunction || null,
                        grabFunctionName: agent.grabFunctionName || null,
                        availableFunctions: agent.availableFunctions || [],
                        condition: Array.isArray(agent.condition) ? agent.condition.map((c) => ({
                            conditionType: c.conditionType || "OnAgentCompletion",
                            conditionValue: c.conditionValue || (agent.userAgentName.toLowerCase().startsWith("securitylayer") ? "Yes" : undefined),
                            executeAgent: c.executeUserAgent || null,
                            executeUserAgent: c.executeUserAgent || null,
                            executed: c.executed || false,
                            answerFromUserAgentName: c.answerFromUserAgentName || null,
                            completionFromUserAgentName: c.completionFromUserAgentName || null,
                            _id: c._id || crypto.randomUUID(),
                        })) : [],
                        output: agent.condition?.filter(c => c.executeUserAgent).length || 1,
                    },
                    deleteNode,
                    onAddPlaceholder: (nodeId) => {
                        setSelectedNodeId(nodeId);
                        addNode(
                            { agentName: "Placeholder", userAgentName: "Placeholder" },
                            nodeId
                        );
                    },
                    onEditNode: handleEditNode,
                    onCopyNode: handleCopyNode,
                    onPasteNode: copiedNode ? handlePasteNode : null,
                },
                position: { x: 0, y: 0 }, // Default position, will be set by arrangeNodesWithDagre
            }));

        // Create edges array from conditions
        let flowEdges = [];
        flow.forEach((agent) => {
            if (Array.isArray(agent.condition)) {
                agent.condition.forEach((cond, index) => {
                    if (
                        cond.executeUserAgent &&
                        !flowEdges.some(
                            (e) =>
                                e.source === agent.userAgentName &&
                                e.target === cond.executeUserAgent
                        )
                    ) {
                        flowEdges.push({
                            id: `${agent.userAgentName}-${cond.executeUserAgent}-${index}`,
                            source: agent.userAgentName,
                            target: cond.executeUserAgent,
                            animated: true,
                            type: 'customEdge',
                        });
                    }
                });
            }
        });

        // Ensure Start node connects to the first non-placeholder, non-start node if no condition exists

        // Special handling for securityLayer nodes
        flowNodes.forEach((node) => {
            if (node.data.agent.userAgentName.toLowerCase().startsWith("securitylayer")) {
                const conditionCount = Array.isArray(node.data.agent.condition) ? node.data.agent.condition.length : 0;
                if (conditionCount === 0) {
                    node.data.agent.condition = [
                        {
                            conditionType: "OnAgentCompletion",
                            conditionValue: "Yes",
                            executeAgent: null,
                            executeUserAgent: null,
                            executed: false,
                            answerFromUserAgentName: null,
                            completionFromUserAgentName: null,
                            _id: crypto.randomUUID(),
                        },
                    ];
                    node.data.agent.output = 1;
                } else {
                    node.data.agent.output = node.data.agent.condition.filter(c => c.executeUserAgent).length || conditionCount;
                }

                const childEdges = flowEdges.filter((e) => e.source === node.id);
                if (childEdges.length < conditionCount) {
                    const existingTargets = childEdges.map((e) => e.target);
                    let newNodes = [...flowNodes];
                    let newEdges = [...flowEdges];

                    for (let i = childEdges.length; i < conditionCount; i++) {
                        const placeholderId = `Placeholder_${crypto.randomUUID() + i}`;
                        const placeholderNode = {
                            id: placeholderId,
                            type: "customNode",
                            data: {
                                label: placeholderId,
                                agent: {
                                    agentName: "Placeholder",
                                    userAgentName: placeholderId,
                                    llmModel: "Meta-Llama-3.1-70B-Instruct",
                                    output: 0,
                                    condition: [],
                                },
                                deleteNode,
                                onAddPlaceholder: (nodeId) => {
                                    setSelectedNodeId(nodeId);
                                    addNode(
                                        { agentName: "Placeholder", userAgentName: "Placeholder" },
                                        nodeId
                                    );
                                },
                                onEditNode: handleEditNode,
                                onCopyNode: handleCopyNode,
                                onPasteNode: copiedNode ? handlePasteNode : null,
                            },
                            position: { x: 0, y: 0 }, // Default position, will be set by arrangeNodesWithDagre
                        };

                        newNodes.push(placeholderNode);
                        newEdges.push({
                            id: `${node.id}-${placeholderId}`,
                            source: node.id,
                            target: placeholderId,
                            animated: true,
                            type: 'customEdge',
                        });

                        if (!node.data.agent.condition[i].executeUserAgent) {
                            node.data.agent.condition[i] = {
                                ...node.data.agent.condition[i],
                                executeUserAgent: placeholderId,
                                executeAgent: placeholderId,
                            };
                        }
                    }

                    flowNodes.splice(0, flowNodes.length, ...newNodes);
                    flowEdges.splice(0, flowEdges.length, ...newEdges);
                }
            }
        });

        console.log("Loaded nodes:", flowNodes);
        console.log("Loaded edges:", flowEdges);

        setNodes(flowNodes);
        setEdges(flowEdges);
        setSelectedFlowId(_id);
        setTimeout(() => arrangeNodesWithDagre(), 0); // Arrange nodes after loading
    };

    const createFlow = () => {
        setNodes(
            initialFlow.map((agent, index) => ({
                id: agent.agentName,
                type: "customNode",
                data: {
                    label: agent.agentName,
                    agent: {
                        ...agent,
                        userAgentName: agent.agentName,
                        displayAgentName: agent.displayAgentName || agent.agentName || "",
                        llmModel: "Meta-Llama-3.1-70B-Instruct",
                        hardCodeFunction: agent.hardCodeFunction || null,
                        grabFunctionName: agent.grabFunctionName || null,
                        availableFunctions: agent.availableFunctions || [],
                        condition: agent.condition.map(() => ({
                            conditionType: "OnAgentCompletion",
                            conditionValue: undefined,
                            executeAgent: null,
                            executeUserAgent: null,
                            executed: false,
                            answerFromUserAgentName: null,
                            completionFromUserAgentName: null,
                        })),
                    },
                    deleteNode,
                    onAddPlaceholder: (nodeId) => {
                        setSelectedNodeId(nodeId);
                        addNode(
                            { agentName: "Placeholder", userAgentName: "Placeholder" },
                            nodeId
                        );
                    },
                    onEditNode: handleEditNode,
                    onCopyNode: handleCopyNode,
                    onPasteNode: copiedNode ? handlePasteNode : null,
                },
                position: { x: 0, y: 0 },
            }))
        );
        setEdges([]);
        setSelectedFlowId(null)
    };

    useEffect(() => {
        if (location.state?.flow) {
            loadFlow(location.state.flow); // function if flow exists
        } else {
            createFlow(); // function if no flow in state
        }
    }, []);

    const calculateOutputs = useCallback((nodes, edges) => {
        const updatedNodes = nodes.map((node) => {
            const outputCount =
                edges.filter((edge) => edge.source === node.id).length || 1;
            const conditions = node.data.agent.condition || [];
            return {
                ...node,
                data: {
                    ...node.data,
                    agent: {
                        ...node.data.agent,
                        output: outputCount,
                        condition: conditions.map((cond) => ({ ...cond })),
                    },
                },
            };
        });
        return updatedNodes;
    }, []);

    const deleteNode = useCallback(
        (nodeId) => {
            // Find all edges where this node is the target
            const incomingEdges = edges.filter((edge) => edge.target === nodeId);

            setNodes((nds) => {
                // Filter out the deleted node
                const updatedNodes = nds.filter((n) => n.id !== nodeId);

                // Update conditions of parent nodes
                const finalNodes = updatedNodes.map((node) => {
                    // Check if the node is a source of an incoming edge to the deleted node
                    const isParent = incomingEdges.some(
                        (edge) => edge.source === node.id
                    );
                    if (!isParent) return node;

                    // Remove conditions that reference the deleted node
                    const updatedConditions = node.data.agent.condition.filter(
                        (condition) => condition.executeUserAgent !== nodeId
                    );

                    // Update the output based on remaining conditions and outgoing edges
                    const outgoingEdges = edges.filter(
                        (e) => e.source === node.id && e.target !== nodeId
                    );
                    const outputCount = Math.max(
                        outgoingEdges.length,
                        updatedConditions.length
                    );

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            agent: {
                                ...node.data.agent,
                                condition: updatedConditions,
                                output: outputCount,
                            },
                        },
                    };
                });

                // Update edges
                setEdges((eds) => {
                    const newEdges = eds.filter(
                        (e) => e.source !== nodeId && e.target !== nodeId
                    );
                    return newEdges;
                });

                // Calculate outputs for the updated nodes and edges
                return calculateOutputs(
                    finalNodes,
                    edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
                );
            });

            setSelectedNodeId(null);
            setEditingNode(null);
            successToast("Node deleted!");
        },
        [nodes, edges, setNodes, setEdges, calculateOutputs]
    );

    const handleEditNode = useCallback(
        (nodeId) => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
                const deepCopiedAgent = {
                    ...node.data.agent,
                    condition: node.data.agent.condition.map((cond) => ({ ...cond })),
                };
                setEditingNode({ id: nodeId, data: deepCopiedAgent });
            }
        },
        [nodes]
    );

    const handleCopyNode = useCallback(
        (nodeId) => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
                setCopiedNode({ ...node.data.agent });
                successToast(`Node ${node.data.agent.userAgentName} copied!`);
            }
        },
        [nodes]
    );

    const handlePasteNode = useCallback(
        (nodeId) => {
            if (!copiedNode) return errorToast("No node copied!");
            setPasteNodeId(nodeId);
            setIsPasteModalOpen(true);
        },
        [copiedNode]
    );

    useEffect(() => {
        setNodes((nodes) => calculateOutputs(nodes, edges));
    }, []);

    // Remove the entire createAndAddCondition function from your code.
    const onConnect = useCallback(
        (params) => {
            const existingEdge = edges.find(
                (e) => e.source === params.source && e.target === params.target
            );
            if (existingEdge) {
                toast.error("Edge already exists!");
                return;
            }

            const sourceNode = nodes.find((n) => n.id === params.source);
            const targetNode = nodes.find((n) => n.id === params.target);

            if (!sourceNode || !targetNode) {
                toast.error("Source or target node not found!");
                return;
            }

            const newEdge = { ...params, id: `${params.source}-${params.target}`, animated: true, type: 'customEdge' };
            const newEdges = addEdge(newEdge, edges);

            // Atomically update nodes with the new condition and recalculated outputs
            setNodes((currentNodes) => {
                const isSourceSecurityLayer = sourceNode.data.agent.userAgentName
                    .toLowerCase()
                    .startsWith("securitylayer");

                // 1. Create the new condition object
                const newCondition = {
                    conditionType: isSourceSecurityLayer ? "OnAgentAnswer" : "OnAgentCompletion",
                    conditionValue: isSourceSecurityLayer ? "Yes" : undefined,
                    executeAgent: targetNode.data.agent.userAgentName,
                    executeUserAgent: targetNode.id,
                    executed: false,
                    answerFromUserAgentName: null,
                    completionFromUserAgentName: null,
                    _id: crypto.randomUUID(),
                };

                // 2. Create an intermediate nodes array with the new condition added
                const nodesWithCondition = currentNodes.map((node) => {
                    if (node.id === params.source) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                agent: {
                                    ...node.data.agent,
                                    condition: [...(node.data.agent.condition || []), newCondition],
                                },
                            },
                        };
                    }
                    return node;
                });

                // 3. Use this intermediate array to calculate outputs and return the final state
                return calculateOutputs(nodesWithCondition, newEdges);
            });

            // The edge state is separate and can be set here
            setEdges(newEdges);

            successToast("Edge connected and condition added!");
            setTimeout(() => arrangeNodesWithDagre(), 0);
        },
        [nodes, edges, setNodes, setEdges, calculateOutputs, arrangeNodesWithDagre]
    );

    const addNode = useCallback(
        (agentTemplate, sourceNodeId) => {
            const isPlaceholder = agentTemplate.userAgentName === "Placeholder";
            const uniqueId = isPlaceholder ? `Placeholder_${crypto.randomUUID()}` : `${agentTemplate.userAgentName}_${crypto.randomUUID()}`;
            const agentName = isPlaceholder ? `Placeholder` : `${agentTemplate.userAgentName}`;

            if (!isPlaceholder && (!selectedNodeId || (!selectedNodeId.startsWith("Placeholder_") && selectedNodeId !== "Placeholder"))) {
                return toast.error(
                    "Please select a placeholder node to add this agent!"
                );
            }

            if (nodes.some((n) => n.id === uniqueId && !isPlaceholder)) {
                return toast.error(`Node ${uniqueId} already exists!`);
            }

            const effectiveSourceNodeId = selectedNodeId || sourceNodeId;

            const defaultConditions = [
                {
                    conditionType: "OnAgentCompletion",
                    conditionValue: "Yes",
                    executeAgent: null,
                    executeUserAgent: null,
                    executed: false,
                    answerFromUserAgentName: null,
                    completionFromUserAgentName: null,
                    _id: crypto.randomUUID(),
                },
                {
                    conditionType: "OnAgentCompletion",
                    conditionValue: "Yes",
                    executeAgent: null,
                    executeUserAgent: null,
                    executed: false,
                    answerFromUserAgentName: null,
                    completionFromUserAgentName: null,
                    _id: crypto.randomUUID(),
                },
            ];

            const newNode = {
                id: uniqueId,
                type: "customNode",
                data: {
                    label: uniqueId,
                    agent: {
                        ...agentTemplate,
                        displayAgentName: agentTemplate.displayAgentName || agentTemplate.agentName || "",
                        agentName: agentTemplate.agentName,
                        userAgentName: uniqueId,
                        llmModel: agentTemplate.llmModel || "Meta-Llama-3.1-70B-Instruct",
                        hardCodeFunction: agentTemplate.hardCodeFunction || null,
                        grabFunctionName: agentTemplate.grabFunctionName || null,
                        availableFunctions: agentTemplate.availableFunctions || [],
                        output: 1,
                        condition: agentTemplate.condition
                            ? agentTemplate.condition.map(createEmptyCondition)
                            : [],
                    },
                },
                position: { x: 0, y: 0 }, // Default position, will be set by arrangeNodesWithDagre
            };

            if (!isPlaceholder && selectedNodeId && (selectedNodeId === "Placeholder" || selectedNodeId.startsWith("Placeholder_"))) {
                const parentEdge = edges.find((e) => e.target === selectedNodeId);
                const parentNodeId = parentEdge?.source;
                const parentNode = nodes.find((n) => n.id === parentNodeId);
                const isParentSecurityLayer = parentNode?.data?.agent?.userAgentName.toLowerCase() === "securitylayer";

                // --- NEW: Find the placeholder node to inherit its properties ---
                const placeholderNodeToReplace = nodes.find(n => n.id === selectedNodeId);
                const conditionsFromPlaceholder = placeholderNodeToReplace?.data?.agent?.condition || [];
                const positionOfPlaceholder = placeholderNodeToReplace?.position || { x: 0, y: 0 };

                // --- MODIFIED: The new node is now created with the placeholder's conditions ---
                const newNode = {
                    id: uniqueId,
                    type: "customNode",
                    data: {
                        label: uniqueId,
                        agent: {
                            ...agentTemplate,
                            displayAgentName: agentTemplate.displayAgentName || agentTemplate.agentName || "",
                            agentName: agentTemplate.agentName,
                            userAgentName: uniqueId,
                            llmModel: agentTemplate.llmModel || "Meta-Llama-3.1-70B-Instruct",
                            hardCodeFunction: agentTemplate.hardCodeFunction || null,
                            grabFunctionName: agentTemplate.grabFunctionName || null,
                            availableFunctions: agentTemplate.availableFunctions || [],
                            output: conditionsFromPlaceholder.length || 1,
                            condition: conditionsFromPlaceholder,
                        },
                    },
                    position: positionOfPlaceholder, // Use the position of the node being replaced
                };

                // This special case handles when the NEW node is a 'securitylayer'.
                // It has its own logic for creating children and should NOT inherit conditions.
                if (agentTemplate.agentName.toLowerCase() === "securitylayer") {
                    setNodes((nds) => {
                        // First, replace the placeholder with a temporary version of the new security node
                        let updatedNodes = nds.map((n) => (n.id === selectedNodeId ? { ...newNode, data: { ...newNode.data, agent: { ...newNode.data.agent, condition: [], output: 2 } } } : n));

                        // Update the parent to point to the new security node
                        if (parentNodeId) {
                            updatedNodes = updatedNodes.map((n) => {
                                if (n.id !== parentNodeId) return n;
                                return {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        agent: {
                                            ...n.data.agent,
                                            condition: n.data.agent.condition.map((c) =>
                                                c.executeUserAgent === selectedNodeId
                                                    ? { ...c, executeUserAgent: uniqueId, executeAgent: agentName }
                                                    : c
                                            ),
                                        },
                                    },
                                };
                            });
                        }

                        // Create the two new placeholder children for the security layer
                        const placeholder1 = {
                            id: `Placeholder_${crypto.randomUUID() + 1}`,
                            type: "customNode",
                            data: {
                                label: `Placeholder_1`,
                                agent: { agentName: "Placeholder", userAgentName: `Placeholder_${crypto.randomUUID() + 1}`, output: 0, condition: [] },
                            },
                            position: { x: positionOfPlaceholder.x + 250, y: positionOfPlaceholder.y - 75 },
                        };
                        const placeholder2 = {
                            id: `Placeholder_${crypto.randomUUID() + 2}`,
                            type: "customNode",
                            data: {
                                label: `Placeholder_2`,
                                agent: { agentName: "Placeholder", userAgentName: `Placeholder_${crypto.randomUUID() + 2}`, output: 0, condition: [] },
                            },
                            position: { x: positionOfPlaceholder.x + 250, y: positionOfPlaceholder.y + 75 },
                        };

                        // Add the new placeholders to the node list
                        updatedNodes.push(placeholder1, placeholder2);

                        // Finally, update the security node itself to connect to its new children
                        updatedNodes = updatedNodes.map((n) => {
                            if (n.id !== uniqueId) return n;
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    agent: {
                                        ...n.data.agent,
                                        output: 2,
                                        condition: defaultConditions.map((cond, i) => ({
                                            ...cond,
                                            executeUserAgent: i === 0 ? placeholder1.id : placeholder2.id,
                                            executeAgent: i === 0 ? placeholder1.id : placeholder2.id,
                                        })),
                                    },
                                },
                            };
                        });

                        // Update edges for the new security layer structure
                        const edge1 = { id: `${uniqueId}->${placeholder1.id}`, source: uniqueId, target: placeholder1.id, animated: true, type: 'customEdge' };
                        const edge2 = { id: `${uniqueId}->${placeholder2.id}`, source: uniqueId, target: placeholder2.id, animated: true, type: 'customEdge' };

                        setEdges((eds) => [...eds.filter(e => e.target !== selectedNodeId), edge1, edge2]);

                        return calculateOutputs(updatedNodes, edges);
                    });
                    setSelectedNodeId(null);
                    return;
                }

                // --- GENERAL CASE for all other node types ---
                setNodes((nds) => {
                    // Replace the placeholder with the new node (which already has inherited conditions).
                    let updatedNodes = nds.map((n) =>
                        n.id === selectedNodeId ? newNode : n
                    );

                    // Update the parent node's condition to point to the new node.
                    if (parentNodeId) {
                        updatedNodes = updatedNodes.map((n) => {
                            if (n.id !== parentNodeId) return n;
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    agent: {
                                        ...n.data.agent,
                                        condition: n.data.agent.condition.map((c) =>
                                            c.executeUserAgent === selectedNodeId
                                                ? { ...c, executeUserAgent: uniqueId, executeAgent: agentName }
                                                : c
                                        ),
                                    },
                                },
                            };
                        });
                    }

                    const finalNodes = calculateOutputs(updatedNodes, edges);
                    setTimeout(() => arrangeNodesWithDagre(), 0);
                    return finalNodes;
                });

                // Update the edges to point to the new node instead of the placeholder.
                setEdges((eds) =>
                    eds.map((e) => {
                        if (e.source === selectedNodeId) {
                            return { ...e, source: uniqueId };
                        }
                        if (e.target === selectedNodeId) {
                            return { ...e, target: uniqueId };
                        }
                        return e;
                    })
                );

                setSelectedNodeId(null);
                return;
            }

            if (isPlaceholder && sourceNodeId) {
                const parentNode = nodes.find((n) => n.id === sourceNodeId);
                if (parentNode?.data?.agent?.userAgentName.toLowerCase() === "securitylayer") {
                    const existingChildren = edges.filter(
                        (edge) => edge.source === sourceNodeId
                    ).length;
                    if (existingChildren >= 2) {
                        return toast.error(
                            "securityLayer can only have exactly two child nodes!"
                        );
                    }
                }

                const newEdge = {
                    id: `${sourceNodeId}-${uniqueId}`,
                    source: sourceNodeId,
                    target: uniqueId,
                    animated: true,
                    type: 'customEdge',
                };
                setNodes((nds) => {
                    const updatedNodes = [...nds, newNode];
                    const finalNodes = updatedNodes.map((n) => {
                        if (n.id !== sourceNodeId) return n;
                        const outgoingEdges = [...edges, newEdge].filter(
                            (e) => e.source === sourceNodeId
                        );

                        if (n.data.agent.userAgentName.toLowerCase() === "securitylayer") {
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    agent: {
                                        ...n.data.agent,
                                        output: 2,
                                        condition: Array(2)
                                            .fill()
                                            .map((_, i) => ({
                                                ...(n.data.agent.condition[i] ||
                                                    defaultConditions[i] ||
                                                    createEmptyCondition()),
                                                executeUserAgent: outgoingEdges[i]?.target || "",
                                                executeAgent: outgoingEdges[i]?.target || "",
                                            })),
                                    },
                                },
                            };
                        }

                        return {
                            ...n,
                            data: {
                                ...n.data,
                                agent: {
                                    ...n.data.agent,
                                    output: outgoingEdges.length,
                                    condition: outgoingEdges.map((e, i) => ({
                                        ...(n.data.agent.condition[i] || createEmptyCondition()),
                                        executeUserAgent: e.target,
                                        executeAgent: e.target,
                                    })),
                                },
                            },
                        };
                    });

                    const updatedNodesWithOutputs = calculateOutputs(finalNodes, [...edges, newEdge]);
                    setTimeout(() => arrangeNodesWithDagre(), 0);
                    return updatedNodesWithOutputs;
                });
                setEdges((eds) => [...eds, newEdge]);
                return;
            }

            if (agentTemplate.agentName.toLowerCase() === "securitylayer") {
                setNodes((nds) => {
                    let updatedNodes = [...nds, newNode];

                    const placeholder1 = {
                        id: `Placeholder_${crypto.randomUUID() + 1}`,
                        type: "customNode",
                        data: {
                            label: `Placeholder_${crypto.randomUUID() + 1}`,
                            agent: {
                                agentName: "Placeholder",
                                userAgentName: `Placeholder_${crypto.randomUUID() + 1}`,
                                displayAgentName: `Placeholder_${crypto.randomUUID() + 1}`,
                                llmModel: "Meta-Llama-3.1-70B-Instruct",
                                hardCodeFunction: null,
                                grabFunctionName: null,
                                availableFunctions: [],
                                output: 0,
                                condition: [],
                            },
                            deleteNode,
                            onAddPlaceholder: (nodeId) => {
                                setSelectedNodeId(nodeId);
                                addNode(
                                    { agentName: "Placeholder", userAgentName: "Placeholder" },
                                    nodeId
                                );
                            },
                            onEditNode: handleEditNode,
                            onCopyNode: handleCopyNode,
                            onPasteNode: copiedNode ? handlePasteNode : null,
                        },
                        position: { x: 0, y: 0 }, // Default position
                    };

                    const placeholder2 = {
                        id: `Placeholder_${crypto.randomUUID() + 2}`,
                        type: "customNode",
                        data: {
                            label: `Placeholder_${crypto.randomUUID() + 2}`,
                            agent: {
                                agentName: "Placeholder",
                                userAgentName: `Placeholder_${crypto.randomUUID() + 2}`,
                                displayAgentName: `Placeholder_${crypto.randomUUID() + 2}`,
                                llmModel: "Meta-Llama-3.1-70B-Instruct",
                                hardCodeFunction: null,
                                grabFunctionName: null,
                                availableFunctions: [],
                                output: 0,
                                condition: [],
                            },
                            deleteNode,
                            onAddPlaceholder: (nodeId) => {
                                setSelectedNodeId(nodeId);
                                addNode(
                                    { agentName: "Placeholder", userAgentName: "Placeholder" },
                                    nodeId
                                );
                            },
                            onEditNode: handleEditNode,
                            onCopyNode: handleCopyNode,
                            onPasteNode: copiedNode ? handlePasteNode : null,
                        },
                        position: { x: 0, y: 0 }, // Default position
                    };

                    updatedNodes = [...updatedNodes, placeholder1, placeholder2];

                    updatedNodes = updatedNodes.map((n) => {
                        if (n.id !== uniqueId) return n;
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                agent: {
                                    ...n.data.agent,
                                    output: 2,
                                    condition: defaultConditions.map((cond, i) => ({
                                        ...cond,
                                        executeUserAgent: i === 0 ? placeholder1.id : placeholder2.id,
                                        executeAgent: i === 0 ? placeholder1.id : placeholder2.id,
                                    })),
                                },
                            },
                        };
                    });

                    const edge1 = {
                        id: `${uniqueId}-${placeholder1.id}`,
                        source: uniqueId,
                        target: placeholder1.id,
                        animated: true,
                        type: 'customEdge',
                    };

                    const edge2 = {
                        id: `${uniqueId}-${placeholder2.id}`,
                        source: uniqueId,
                        target: placeholder2.id,
                        animated: true,
                        type: 'customEdge',
                    };

                    setEdges((eds) => [...eds, edge1, edge2]);
                    const updatedNodesWithOutputs = calculateOutputs(updatedNodes, [...edges, edge1, edge2]);
                    setTimeout(() => arrangeNodesWithDagre(), 0);
                    return updatedNodesWithOutputs;
                });
                return;
            }

            setNodes((nds) => {
                const updatedNodes = [...nds, newNode];
                const updatedNodesWithOutputs = calculateOutputs(updatedNodes, edges);
                setTimeout(() => arrangeNodesWithDagre(), 0);
                return updatedNodesWithOutputs;
            });

        }, [nodes, edges, selectedNodeId, setNodes, setEdges, deleteNode, handleEditNode, handleCopyNode, handlePasteNode, copiedNode, calculateOutputs, arrangeNodesWithDagre,]
    );

    const pasteNode = useCallback(
        (sourceAgent, targetNodeId) => {
            const targetNode = nodes.find((n) => n.id === targetNodeId);
            if (!targetNode) return toast.error("Target node not found!");

            let newAgentName = `${sourceAgent.userAgentName} clone`;
            let counter = 1;

            while (nodes.some((n) => n.id === newAgentName)) {
                newAgentName = `${sourceAgent.userAgentName} clone_${counter++}`;
            }

            const newNode = {
                id: newAgentName,
                type: "customNode",
                data: {
                    label: newAgentName,
                    agent: {
                        ...sourceAgent,
                        userAgentName: newAgentName,
                        output: 1,
                        condition: sourceAgent.condition.map((c) => ({
                            conditionType: c.conditionType || "OnAgentCompletion",
                            conditionValue: c.conditionValue || undefined,
                            executeAgent: c.executeAgent || null,
                            executeUserAgent: c.executeUserAgent || null,
                            executed: c.executed || false,
                            answerFromUserAgentName: c.answerFromUserAgentName || null,
                            completionFromUserAgentName: c.completionFromUserAgentName || null,
                        })),
                    },
                    deleteNode,
                    onAddPlaceholder: (nodeId) => {
                        setSelectedNodeId(nodeId);
                        addNode(
                            { agentName: "Placeholder", userAgentName: "Placeholder" },
                            nodeId
                        );
                    },
                    onEditNode: handleEditNode,
                    onCopyNode: handleCopyNode,
                    onPasteNode: copiedNode ? handlePasteNode : null,
                },
                position: { x: 0, y: 0 }, // Default position
            };

            setNodes((nds) => {
                const updatedNodes = nds.map((n) =>
                    n.id === targetNodeId ? newNode : n
                );
                const parentEdges = edges.filter((e) => e.target === targetNodeId);
                parentEdges.forEach((pe) => {
                    updatedNodes.forEach((n) => {
                        if (n.id === pe.source) {
                            n.data.agent.condition = n.data.agent.condition.map((c) =>
                                c.executeUserAgent === targetNodeId
                                    ? { ...c, executeUserAgent: newAgentName }
                                    : c
                            );
                        }
                    });
                });
                const updatedNodesWithOutputs = calculateOutputs(updatedNodes, edges);
                setTimeout(() => arrangeNodesWithDagre(), 0);
                return updatedNodesWithOutputs;
            });

            setEdges((eds) =>
                eds.map((e) =>
                    e.source === targetNodeId
                        ? { ...e, source: newAgentName }
                        : e.target === targetNodeId
                            ? { ...e, target: newAgentName }
                            : e
                )
            );

            toast.success(
                `Node ${sourceAgent.userAgentName} pasted as ${newAgentName}!`
            );
        },
        [
            nodes,
            edges,
            setNodes,
            setEdges,
            deleteNode,
            handleEditNode,
            handleCopyNode,
            handlePasteNode,
            copiedNode,
            calculateOutputs,
            arrangeNodesWithDagre,
        ]
    );

    const handleUpdateNode = useCallback(
        (updatedAgent) => {
            console.log("updatedagent", updatedAgent);
            const fullUpdatedAgent = {
                ...updatedAgent,
                availableFunctions: updatedAgent.availableFunctions || [],
                agentPrompt: updatedAgent.agentPrompt || "",
                llmModel: updatedAgent.llmModel || "",
                hardCodeFunction: updatedAgent.hardCodeFunction || null,
                grabFunctionFrom: updatedAgent.grabFunctionFrom || null,
            };

            setNodes((nds) => {
                const updatedNodes = nds.map((n) =>
                    n.id === editingNode?.id
                        ? {
                            ...n,
                            data: {
                                ...n.data,
                                agent: fullUpdatedAgent,
                                label: fullUpdatedAgent.userAgentName,
                            },
                        }
                        : n
                );
                const updatedNodesWithOutputs = calculateOutputs(updatedNodes, edges);
                setTimeout(() => arrangeNodesWithDagre(), 0);
                return updatedNodesWithOutputs;
            });
            setEditingNode(null);
            toast.success("Node updated!");
        },
        [editingNode, setNodes, edges, calculateOutputs, arrangeNodesWithDagre]
    );

    const deleteEdge = useCallback(
        (edgeId) => {
            setEdges((eds) => {
                const edgeToDelete = eds.find((e) => e.id === edgeId);
                const newEdges = eds.filter((e) => e.id !== edgeId);
                setNodes((nds) => {
                    const updatedNodes = nds.map((n) => {
                        if (n.id !== edgeToDelete?.source) return n;
                        const conditions = n.data.agent.condition.map((cond) => ({
                            ...cond,
                        }));
                        const preservedConditions = conditions.filter(
                            (c) =>
                                c.executeUserAgent !== edgeToDelete.target ||
                                c.executeAgent === "securityLayer"
                        );
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                agent: {
                                    ...n.data.agent,
                                    condition: preservedConditions,
                                    output: Math.max(
                                        newEdges.filter((e) => e.source === n.id).length,
                                        preservedConditions.length
                                    ),
                                },
                            },
                        };
                    });
                    console.log("After deleteEdge, Start node conditions:", {
                        startNode: updatedNodes.find(
                            (n) => n.id === "Start" || n.id === "node1"
                        ),
                        conditionLength: updatedNodes.find(
                            (n) => n.id === "Start" || n.id === "node1"
                        )?.data.agent.condition.length,
                        conditions: updatedNodes.find(
                            (n) => n.id === "Start" || n.id === "node1"
                        )?.data.agent.condition,
                    });
                    const updatedNodesWithOutputs = calculateOutputs(updatedNodes, newEdges);
                    setTimeout(() => arrangeNodesWithDagre(), 0);
                    return updatedNodesWithOutputs;
                });
                return newEdges;
            });
            toast.success("Edge deleted!");
        },
        [setEdges, setNodes, calculateOutputs, arrangeNodesWithDagre]
    );

    const generateOutput = () => {

        // 1. Clear any previous errors at the start of validation.
        setNodeErrors([]);
        const errors = [];

        // Create a set of all valid node IDs for quick lookups.
        const allNodeIds = new Set(nodes.map(n => n.id));

        // Find all nodes that are targets of an edge.
        const incomingEdgeTargets = new Set(edges.map(e => e.target));
        // Find all nodes that are sources of an edge.
        const outgoingEdgeSources = new Set(edges.map(e => e.source));

        // 2. Perform validation checks for every node in the flow.
        nodes.forEach(node => {
            const agentName = node.data.agent?.agentName?.toLowerCase() || '';

            // VALIDATION 1: Check for placeholder nodes that haven't been replaced.
            if (agentName.includes('placeholder')) {
                errors.push({
                    nodeId: node.id,
                    message: "This placeholder must be replaced with a real agent."
                });
            }

            // VALIDATION 2: Check if an 'issueidentifier' node is missing its required functions.
            if (agentName === 'issueidentifier') {
                const availableFunctions = node.data.agent.availableFunctions || [];
                if (availableFunctions.length === 0) {
                    errors.push({
                        nodeId: node.id,
                        message: "Issue Identifier agent must have at least one function in 'availableFunctions'."
                    });
                }
            }

            // VALIDATION 3: Check for incomplete or broken conditions on any node.
            if (node.data.agent?.condition) {
                node.data.agent.condition.forEach((c, index) => {
                    const conditionLabel = `Condition #${index + 1}`;

                    // Check for incomplete "From Agent" selections. This check is now ALWAYS active.
                    if (c.conditionType === "OnAgentCompletion" && !c.completionFromUserAgentName) {
                        errors.push({
                            nodeId: node.id,
                            message: `${conditionLabel} ("OnAgentCompletion") is missing a 'From Agent' selection.`
                        });
                    }
                    if (c.conditionType === "OnAgentAnswer" && !c.answerFromUserAgentName) {
                        errors.push({
                            nodeId: node.id,
                            message: `${conditionLabel} ("OnAgentAnswer") is missing a 'From Agent' selection.`
                        });
                    }

                    // Check for broken connections (dangling edges).
                    if (c.executeUserAgent && !allNodeIds.has(c.executeUserAgent)) {
                        errors.push({
                            nodeId: node.id,
                            message: `${conditionLabel} points to a node that no longer exists.`
                        });
                    }
                });
            }
        });

        // VALIDATION 4: Check the overall flow structure.
        const rootNodes = nodes.filter(n => !incomingEdgeTargets.has(n.id));
        if (rootNodes.length === 0 && nodes.length > 0) {
            // This finds if there's no clear starting point (e.g., a cycle with no entry).
            errors.push({ nodeId: nodes[0].id, message: "This flow has no clear starting point (root node)." });
        }

        const terminalNodes = nodes.filter(n => !outgoingEdgeSources.has(n.id) && !n.data.agent.agentName.toLowerCase().includes('placeholder'));
        if (terminalNodes.length === 0 && nodes.length > 0) {
            // This finds if there's no clear end point.
            errors.push({ nodeId: nodes[0].id, message: "This flow has no clear end point (terminal node)." });
        }

        // 3. Check if any errors were found during validation.
        if (errors.length > 0) {
            setNodeErrors(errors);
            errorToast("Flow has validation errors. Please see highlighted nodes.");
            return null; // Stop the process.
        }

        // 4. If all checks pass, generate the final output object.
        const validAgents = nodes.filter((n) => !n.data.agent.agentName.toLowerCase().includes("placeholder"));
        if (validAgents.length === 0) {
            errorToast("Please add at least one agent to the flow.");
            return null;
        }

        return {
            data: {
                flow: nodes.filter((n) => n.data.agent.agentName !== "Start" && n.data.agent.agentName !== "Placeholder").map((n) => ({
                    agentName: n.data.agent.agentName,
                    userAgentName: `${n.data.agent.userAgentName}`,
                    displayAgentName: n.data.agent.displayAgentName || "",
                    output: n.data.agent.output,
                    agentPrompt: n.data.agent.prompt || "",
                    llmModel: n.data.agent.llmModel || "Meta-Llama-3.1-70B-Instruct",
                    hardCodeFunction: n.data.agent.hardCodeFunction || null,
                    grabFunctionFrom: n.data.agent.grabFunctionFrom || null,
                    availableFunctions: n.data.agent.availableFunctions || [],
                    condition: n.data.agent.condition.map((c) => ({
                        conditionType: c.conditionType || "OnAgentCompletion",
                        conditionValue: c.conditionValue || undefined,
                        executeAgent: `${c.executeAgent}`,
                        executeUserAgent: `${c.executeUserAgent}`,
                        executed: c.executed || false,
                        answerFromUserAgentName: c.answerFromUserAgentName || null,
                        completionFromUserAgentName: c.completionFromUserAgentName || null,
                    })),
                    reply:n.data.agent.reply || ""
                })),
                position: {
                    nodes: [],
                    edges: []
                },
            },
        };
    };

    const handleSaveFlow = async (isPublish = false) => {
        try {
            const flowOutput = generateOutput();
         
            if (!flowOutput || !flowOutput?.data) {
                console.log(flowOutput)
                return;
            }

            setSavingFlow(true)
            let result;
            if (selectedFlowId) {
                // Update existing flow
                result = await updateBotFlow({
                    flow: flowOutput.data,
                    agentId: aiAgentData?.agentId,
                    flowId: selectedFlowId,
                    token,
                    flowDetails
                });
             
                successToast("Flow updated successfully!");
            } else {
                // Create a new flow
                
                result = await sendToBotFlow({
                    flow: flowOutput.data,
                    agentId: aiAgentData?.agentId,
                    token,
                    flowDetails: flowDetails
                });
               
                if (result?._id) {
                    setSelectedFlowId(result._id);
                    successToast("Flow saved successfully!");
                } else {
                    throw new Error("Flow creation failed: Missing flow ID.");
                }
            }

            // Handle publish toggle if requested
            if (result?._id) {
                const toggleRes = await toggleFlowStateService({
                    flowId: result._id,
                    isActive: isPublish,
                    token,
                });

                if (!toggleRes.success) {
                    throw new Error(toggleRes.message || "Failed to toggle flow state.");
                }

                if (isPublish) {
                    successToast("Flow published successfully!");

                    // Trigger the flow on Node-RED
                    const triggerRes = await triggerNodeRedFlow({
                        flowId: result._id,
                        agentId: aiAgentData?.agentId,
                        token,
                    });

                    if (triggerRes?.message) {
                        successToast(triggerRes.message);
                    }
                } else {
                    successToast("Flow saved as draft.");
                }
            }

        } catch (error) {
            console.error("Failed to save/update flow:", error);
            errorToast(error?.message || "An error occurred while saving the flow.");
        } finally {
            setSavingFlow(false)
        }
    };

    const handleBack = () => {
        navigate(`/agent/${aiAgentData?.agentName}`)
        setFlowDetails({
            flowName: '',
            flowDescription: ''
        })
        console.log("function calling ")
    }

    const nodeActions = useMemo(() => ({
        addNode,
        onEditNode: handleEditNode,
        onCopyNode: handleCopyNode,
        onPasteNode: handlePasteNode,
        deleteNode: deleteNode,
        nodeErrors: nodeErrors
    }), [addNode, handleEditNode, handleCopyNode, handlePasteNode, deleteNode, nodeErrors]);

    return (
        <div className="w-full h-full flex gap-2 px-4 py-2">
            {(
                <>
                    <NodeActionsProvider actions={nodeActions}>
                        <div className="flex-1 flex flex-col gap-2 h-full rounded-lg">
                            <AgentToolbar
                                selectedFlowId={selectedFlowId}
                                handleSaveFlow={handleSaveFlow}
                                arrangeNodesInHorizontalTree={arrangeNodesWithDagre}
                                setOpen={setOpen}
                                flowDetails={flowDetails}
                                handleBack={handleBack}
                            />
                            <div
                                style={{ backgroundColor: colors.backgroundSecondary, border: `1px solid ${colors.borderColor}` }}
                                className="w-full relative flex flex-col h-full rounded-lg"
                            >
                                {savingFlow ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <Loader2 size={24} className="animate-spin" />
                                    </div>
                                ) : (
                                    <ReactFlow
                                        nodes={nodes}
                                        edges={edges}
                                        onNodesChange={onNodesChange}
                                        onEdgesChange={onEdgesChange}
                                        onConnect={onConnect}
                                        onNodeClick={(e, n) =>
                                            setSelectedNodeId(
                                                n.id.startsWith("Placeholder") || n.id === "Placeholder"
                                                    ? n.id
                                                    : null
                                            )
                                        }
                                        nodeTypes={nodeTypes}
                                        edgeTypes={edgeTypes}
                                    >
                                        <Controls />
                                        <Background
                                            gap='15'
                                        />
                                        <Panel position="top-right" >
                                            <div className="flex items-center gap-2" >
                                                <Tippy
                                                    content="Re-arange"
                                                    placement="bottom"
                                                    theme={theme === 'light' ? 'light' : 'dark'}
                                                    className="text-sm px-2 py-1 rounded-lg shadow-sm"
                                                    animation="fade"
                                                    delay={[100, 0]}
                                                    popperOptions={{
                                                        modifiers: [
                                                            {
                                                                name: 'offset',
                                                                options: {
                                                                    offset: [0, 8],
                                                                },
                                                            },
                                                        ],
                                                    }}
                                                >
                                                    <button
                                                        variant="none"
                                                        className="p-1.5 h-9 w-9 rounded-full flex items-center justify-center"
                                                        style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                                        onClick={() => arrangeNodesWithDagre()}
                                                    >
                                                        <LayoutGrid size={18} />
                                                    </button>
                                                </Tippy>
                                                <button
                                                    onClick={() => setShowEdgeSidebar(true)}
                                                    style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                                    className="p-1.5 h-9 w-9 rounded-full flex items-center justify-center"
                                                >
                                                    <LucideGitBranch size={18} />
                                                </button>
                                            </div>
                                        </Panel>
                                    </ReactFlow>
                                )}
                            </div>

                        </div>

                        {editingNode && (
                            <NodeEditorSidebar
                                nodeData={editingNode.data}
                                onUpdate={handleUpdateNode}
                                onCancel={() => setEditingNode(null)}
                                addNode={addNode}
                                editingNodeId={editingNode.id}
                                nodes={nodes}
                                edges={edges}
                            />
                        )}

                        {showEdgeSidebar && (
                            <EdgeEditorSidebar
                                colors={colors}
                                edges={edges}
                                nodes={nodes}
                                deleteEdge={deleteEdge}
                                setShowEdgeSidebar={setShowEdgeSidebar}
                            />
                        )}

                        {(
                            <PasteModal
                                colors={colors}
                                copiedNode={copiedNode}
                                onPaste={() => {
                                    pasteNode(copiedNode, pasteNodeId);
                                    setIsPasteModalOpen(false);
                                    setPasteNodeId(null);
                                }}
                                onCancel={() => {
                                    setIsPasteModalOpen(false);
                                    setPasteNodeId(null);
                                }}
                                open={isPasteModalOpen}
                                setOpen={setIsPasteModalOpen}
                            />
                        )}
                        <FlowDetails
                            handleCancel={() => {
                                navigate(`/agent/${aiAgentData?.agentName}`)
                            }}
                            flowDetails={flowDetails}
                            setFlowDetails={setFlowDetails}
                            open={open}
                            setOpen={setOpen}
                            selectedFlowId={selectedFlowId}
                        />
                    </NodeActionsProvider>
                </>
            )}
        </div>
    );
};

export default FlowMaker;

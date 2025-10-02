import ReusableButton from '@/components/Utils/ReusableButton';
import { errorToast, successToast, warningToast } from '@/components/Utils/ShambhoToast';
import axios from '@/config/axios';
import { fetchFaqModels } from '@/redux/slice/faq_model/modelSlice';
import { setTools } from '@/redux/slice/toolsslice/toolsSlice';
import { useTheme } from '@/theme/ThemeContext';
import { ChevronRight, Edit2, Plus, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import ConditionModal from './component/ConditionModal';
import { getFilteredAgentDisplayNames } from './services/Utils';
import { fetchReactAgentFlow } from './services/botFlowService';

const NodeEditorSidebar = ({ nodes, nodeData, onUpdate, onCancel, editingNodeId, addNode }) => {
    const { colors } = useTheme();
    const dispatch = useDispatch();
    const aiAgentData = useSelector((state) => state.aiAgentDefinition)

    const { availableModels, loading, error } = useSelector(state => state.models);

    const [localNodeData, setLocalNodeData] = useState({
        userAgentName: nodeData?.userAgentName || '',
        agentName: nodeData?.agentName || nodeData?.userAgentName || '',
        displayAgentName: nodeData?.displayAgentName || nodeData?.agentName || "",
        llmModel: nodeData?.llmModel || 'Meta-Llama-3.1-70B-Instruct',
        hardCodeFunction: nodeData?.hardCodeFunction || null,
        grabFunctionFrom: nodeData?.grabFunctionFrom || null,
        output: nodeData?.output || 0,
        condition: (nodeData?.condition || []).map(cond => ({
            conditionType: cond.conditionType || "OnAgentCompletion",
            conditionValue: cond.conditionValue || undefined,
            executeAgent: cond.executeAgent || null,
            executeUserAgent: cond.executeUserAgent || null,
            executed: cond.executed || false,
            answerFromUserAgentName: cond.answerFromUserAgentName || null,
            completionFromUserAgentName: cond.completionFromUserAgentName || null,
        })),
        availableFunctions: (nodeData?.availableFunctions || []).slice(),
        reply:nodeData.reply || ""
    });
    const [modalConditionData, setModalConditionData] = useState({
        conditionType: "OnAgentCompletion",
        conditionValue: undefined,
        executeAgent: null,
        executeUserAgent: null,
        executed: false,
        answerFromUserAgentName: null,
        completionFromUserAgentName: null,
    });
    


    const [hasAddedIssueIdentifier, setHasAddedIssueIdentifier] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalConditionIndex, setModalConditionIndex] = useState(null);
    const [selectedFunction, setSelectedFunction] = useState('');
    const [functions, setFunctions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const token = localStorage.getItem('token');
    const tools = useSelector(state => state.tools?.tools);

    const fetchFunctionsByBotId = async (agentId) => {

        if (!agentId || functions.length !== 0) {
            errorToast('Bot ID is missing');
            return;
        }

        try {

            if (tools.length !== 0) {
                setFunctions(tools);
                if (tools.length === 0) {
                    console.log('No Tools found in Slice');
                }
                return;
            }

            setIsLoading(true);

            const response = await axios.get(`/api/tool/all/${agentId}`, {
                headers: {
                    'auth-token': token,
                },
            });
            const fetchedTools = response.data.result || [];
            setFunctions(fetchedTools);
            dispatch(setTools(fetchedTools));
            if (fetchedTools.length === 0) {
                warningToast('No Tools found for this bot');
            }
        } catch (error) {
            console.error('Error fetching functions:', error);
            errorToast('Failed to fetch functions');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (availableModels.length === 0) {
            dispatch(fetchFaqModels(token));
        }
    }, [availableModels.length, dispatch, token]);

    useEffect(() => {
        const isFunctionalOrIssueAgent = localNodeData.userAgentName === 'functionalAgent' || localNodeData.userAgentName === 'issueIdentifier';
        if (isFunctionalOrIssueAgent && !hasAddedIssueIdentifier) {
            const issueNode = nodes.find(node => node.data?.agent?.agentName?.toLowerCase() === 'issueidentifier');
            if (issueNode) {
                setFunctions(prevFunctions => {
                    const exists = prevFunctions.some(func => func._id === 'issueIdentifier');
                    if (!exists) {
                        const issueIdentifierFunction = {
                            _id: 'issueIdentifier',
                            agentId: aiAgentData?.agentId,
                            companyId: aiAgentData?.companyId,
                            toolName: `${issueNode.data.agent.userAgentName}`,
                            parameters: [],
                        };
                        setHasAddedIssueIdentifier(true);
                        return [...prevFunctions, issueIdentifierFunction];
                    }
                    return prevFunctions;
                });
            }
        }
    }, [localNodeData.agentName, nodes, hasAddedIssueIdentifier, aiAgentData]);

    useEffect(() => {
        if (aiAgentData.agentId) {
            fetchFunctionsByBotId(aiAgentData.agentId).then(() => {
                const isFunctionalOrIssueAgent = localNodeData.agentName === 'functionalAgent' || localNodeData.agentName === 'issueIdentifier';
                if (isFunctionalOrIssueAgent) {
                    const issueNode = nodes.find(node => node.data?.agent?.agentName?.toLowerCase() === 'issueidentifier');
                    if (issueNode && !functions.some(f => f._id === 'issueIdentifier')) {
                        setFunctions(prev => [...prev, {
                            _id: 'issueIdentifier',
                            agentId: aiAgentData?.agentId,
                            companyId: aiAgentData?.companyId,
                            toolName: `${issueNode.data.agent.userAgentName}`,
                            parameters: [],
                        }]);
                    }
                }
            });
        }
    }, [aiAgentData.agentId]);

    useEffect(() => {
        setHasAddedIssueIdentifier(false);
    }, [editingNodeId]);

    useEffect(() => {
        setLocalNodeData({
            userAgentName: nodeData?.userAgentName || '',
            agentName: nodeData?.agentName || nodeData?.userAgentName || '',
            displayAgentName: nodeData?.displayAgentName || nodeData?.agentName || '',
            llmModel: nodeData?.llmModel || 'Meta-Llama-3.1-70B-Instruct',
            hardCodeFunction: nodeData?.hardCodeFunction || null,
            grabFunctionFrom: nodeData?.grabFunctionFrom || null,
            prompt: nodeData?.prompt || nodeData?.agentPrompt || '',
            output: nodeData?.output || 0,
            condition: (nodeData?.condition || []).map(cond => ({
                conditionType: cond.conditionType || "OnAgentCompletion",
                conditionValue: cond.conditionValue || undefined,
                executeAgent: cond.executeAgent || null,
                executeUserAgent: cond.executeUserAgent || null,
                executed: cond.executed || false,
                answerFromUserAgentName: cond.answerFromUserAgentName || null,
                completionFromUserAgentName: cond.completionFromUserAgentName || null,
            })),
            availableFunctions: (nodeData?.availableFunctions || []).slice(),
            reply:nodeData.reply || ""
        });
    }, [nodeData]);

    const getReactFlows = async()=>{
      
        const reactFlows=await fetchReactAgentFlow(aiAgentData.agentId,token);
        return reactFlows;
    }
    const getFilteredFunctions = () => {
        let filteredFunction;
        if(localNodeData.agentName==='functionalAgent'){
            filteredFunction = functions;
        }
        else if(localNodeData.agentName==='reactAgent'){
             console.log(functions)
            filteredFunction = getReactFlows();
        }
        else{
           
            filteredFunction = functions.filter(func => func._id !== 'issueIdentifier');
        }
        return filteredFunction
    };

    const openConditionModal = (index) => {
        setModalConditionData({ ...localNodeData.condition[index] });
        setModalConditionIndex(index);
        setIsModalOpen(true);
    };

    const handleModalFieldChange = (field, value) => {
        setModalConditionData((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleDisplayNameChange = (e) => {
        setLocalNodeData((prev) => ({
            ...prev,
            displayAgentName: e.target.value,
        }));
    };
    
    const handleReplyChange=(e)=>{
        setLocalNodeData((prev)=>({...prev,reply:e.target.value}))
    }

    const handleSystemAgentNameChange = (e) => {
        setLocalNodeData((prev) => ({
            ...prev,
            agentName: e.target.value,
        }));
    };

    const handleAgentModelChange = (e) => {
        setLocalNodeData((prev) => ({
            ...prev,
            llmModel: e.target.value,
        }));
    };

    const saveModalEdits = () => {
        if (modalConditionIndex !== null) {
            setLocalNodeData((prev) => ({
                ...prev,
                condition: prev.condition.map((cond, i) =>
                    i === modalConditionIndex
                        ? {
                            ...modalConditionData,
                            executeAgent: modalConditionData.executeUserAgent, // Ensure executeAgent is updated
                        }
                        : cond
                ),
            }));
            successToast("Modal Edits Saved Successfully");
        }
        setIsModalOpen(false);
        setModalConditionIndex(null);
    };

    const cancelModalEdits = () => {
        setIsModalOpen(false);
        setModalConditionIndex(null);
    };

    const handleAddCondition = () => {
        if (!addNode) {
            errorToast('Add node function is not available');
            return;
        }

        addNode(
            { agentName: "Placeholder", userAgentName: "Placeholder" },
            editingNodeId
        );
        successToast("Placeholder node added successfully");
        onCancel()
    };

    const handleAddTool = (toolId) => {
        if (!toolId) {
            errorToast('Please select a function to add');
            return;
        }

        const toolToAdd = functions.find(func => func._id === toolId);

        if (!toolToAdd) {
            errorToast('Selected function not found');
            return;
        }

        const alreadyExists = localNodeData.availableFunctions.some(
            func => func.id === toolToAdd._id
        );

        if (alreadyExists) {
            errorToast('Function already assigned');
            return;
        }

        const functionObject = {
            id: toolToAdd._id,
            name: toolToAdd.toolName || toolToAdd.functionName || "Unnamed Function"
        };

        setLocalNodeData((prev) => ({
            ...prev,
            availableFunctions: [...prev.availableFunctions, functionObject],
        }));
        setSelectedFunction('');
        successToast(`Function ${functionObject.name} added`);
    };

    const handleRemoveFunction = (func) => {
        setLocalNodeData((prev) => ({
            ...prev,
            availableFunctions: prev.availableFunctions.filter((f) => f.id !== func.id),
        }));
        successToast(`Function ${func.name} removed`);
    };

    const handleSubmit = () => {
        onUpdate(localNodeData);
        
        successToast('Node updated successfully');
    };

    const getAgentDisplayName = (executeUserAgentId, nodes) => {

        if (!executeUserAgentId || !nodes) return "Not found";

        const foundNode = nodes.find((node) => node.data.agent.userAgentName === executeUserAgentId || node.id === executeUserAgentId);

        return foundNode?.data?.agent?.displayAgentName || foundNode?.data?.agent?.agentName || "Not found";
    };

    useEffect(() => {
        console.log("Node Data in NodeEditorSidebar: ", functions);
    }, [])

    return (
        <>
            <div
                style={{ backgroundColor: colors.backgroundSecondary, border: `1px solid ${colors.borderColor}` }}
                className="h-full w-[400px] rounded-lg z-20 flex flex-col"
            >
                <div className=" p-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold truncate">Edit Node: {localNodeData.displayAgentName}</h2>
                    <button
                        onClick={onCancel}
                        style={{ backgroundColor: colors.backgroundPrimary }}
                        className="p-1.5 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-4 overflow-y-auto flex-1 h-full scrollbar-thin space-y-4">
                    <div
                        style={{ border: `1px solid ${colors.borderColor}` }}
                        className="grid grid-cols-1 gap-4 rounded-2xl p-4"
                    >
                        {/* Agent Type */}
                        <div className="flex items-center justify-between pb-3">
                            <span className="text-sm font-semibold text-gray-500">Agent Type:</span>
                            <span className="text-sm font-medium opacity-90">
                                {localNodeData.agentName || "No Name"}
                            </span>
                        </div>

                        {/* Display Agent Name */}
                        <div>
                            <label className="block text-sm font-semibold mb-2">Display Agent Name</label>
                            <input
                                type="text"
                                value={localNodeData.displayAgentName}
                                onChange={handleDisplayNameChange}
                                placeholder="Enter a name to show for the agent"
                                style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                className="w-full px-4 py-1 h-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition-all"
                            />
                        </div>

                        {/* Agent Model
                        <div>
                            <label className="block text-sm font-semibold mb-2">LLM Model</label>
                            <select
                                value={localNodeData.llmModel}
                                onChange={handleAgentModelChange}
                                style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                className="w-full px-4 py-1 h-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition-all"
                            >
                                <option value="" disabled>Select a Model</option>
                                {availableModels.map((model, index) => (
                                    <option key={index} value={model}>
                                        {model}
                                    </option>
                                ))}
                            </select>
                        </div> */}

                        {/* Agent Prompt */}
                       { nodeData.agentName ==="functionalAgent" && (<div>
                            <label className="block text-sm font-semibold mb-2">Agent Prompt</label>
                            <textarea
                                value={localNodeData.prompt}
                                readOnly
                                style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                className="w-full text-sm px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition-all resize-y min-h-[180px]"
                            />
                        </div>)}
                        {/* Reply Field */}
                     { nodeData.agentName ==="replyAgent" && ( <div>
                            <label className="block text-sm font-semibold mb-2">Reply Message</label>
                            <textarea
                                value={localNodeData.reply}
                                onChange={handleReplyChange}
                                style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                className="w-full text-sm px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition-all resize-y min-h-[180px]"
                            />
                        </div>)}
                    </div>

                    {/* Functions Field Section */}
                    {['functionalAgent', 'issueIdentifier','reactAgent'].some(prefix => localNodeData.agentName?.startsWith(prefix)) && (
                        <div
                            style={{ backgroundColor: colors.backgroundSecondary, border: `1px solid ${colors.borderColor}` }}
                            className="rounded-2xl p-4"
                        >
                            <div className="rounded-lg">
                                {localNodeData.availableFunctions.length === 0 && getFilteredFunctions().length === 0 ? (
                                    <p className="text-sm text-gray-500 mb-2">
                                        No Tools are available. Please visit the{' '}
                                        <Link to="/agent/function" className="text-blue-600 underline hover:text-blue-800 transition">
                                            Tool Management Page
                                        </Link>{' '}
                                        to add new tools.
                                    </p>
                                ) : (
                                    <>
                                        {/* Assigned Tools Section */}
                                        <label className="block text-sm font-medium mb-1">Assigned Tools</label>
                                        {localNodeData.availableFunctions.length > 0 && (
                                            <div className="flex flex-wrap items-center justify-start mb-4 max-h-40 gap-2 overflow-y-auto">
                                                {localNodeData.availableFunctions.map((func, index) => (
                                                    <div key={func.id || index} className="w-fit flex justify-between items-center rounded-lg px-3 py-2 border" style={{ backgroundColor: colors.backgroundPrimary, borderColor: colors.borderColor }}>
                                                        <span className="text-sm">{func.name}</span>
                                                        <button onClick={() => handleRemoveFunction(func)} className="text-red-500 hover:text-red-700 transition">
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Add Tool Dropdown */}
                                        <label className="block text-sm font-medium mb-1">Add Tool</label>
                                        {
                                            isLoading ? (
                                                <p className="text-sm text-gray-500">Loading available tools...</p>
                                            ) : getFilteredFunctions().length > 0 ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        onChange={(e) => handleAddTool(e.target.value)}
                                                        value=""
                                                        style={{
                                                            backgroundColor: colors.backgroundPrimary,
                                                            border: `1px solid ${colors.borderColor}`,
                                                        }}
                                                        className="w-full max-w-full px-4 py-1 h-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition"
                                                    >
                                                        <option value="">
                                                            Select a Tool
                                                        </option>
                                                        {getFilteredFunctions().map((func) => {
                                                            const name = func?.toolName || func?.functionName || "Missing Name";
                                                            return (
                                                                <option
                                                                    key={func._id}
                                                                    value={func?._id}
                                                                    title={name}
                                                                >
                                                                    {name.length > 30 ? name.slice(0, 27) + '...' : name}
                                                                </option>
                                                            );
                                                        })}
                                                    </select>
                                                </div>
                                            ) : null
                                        }

                                        {/* Grab Function Name Input
                                        <div className="mt-4">
                                            <label className="block text-sm font-medium mb-1">Grab Function From</label>
                                            <select
                                                value={localNodeData.grabFunctionFrom || ''}
                                                onChange={(e) => setLocalNodeData((prev) => ({
                                                    ...prev,
                                                    grabFunctionFrom: e.target.value || null,
                                                    hardCodeFunction: e.target.value === 'userAgent' ? null : prev.hardCodeFunction, // Reset hardCodeFunction if switching to userAgent
                                                }))}
                                                style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                                className="w-full px-4 py-1 h-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition-all"
                                            >
                                                <option value="">Select an option</option>
                                                <option value="self">Self</option>
                                                <option value="userAgent">userAgent</option>
                                            </select>
                                        </div> */}

                                        {/* Hard Code Function Input */}
                                        <div className="mt-4">
                                            <label className="block text-sm font-medium mb-1">Hard Code Function</label>
                                            {/* {localNodeData.grabFunctionFrom === 'self' ? (
                                                <input
                                                    type="text"
                                                    value={localNodeData.hardCodeFunction || ''}
                                                    onChange={(e) => setLocalNodeData((prev) => ({
                                                        ...prev,
                                                        hardCodeFunction: e.target.value || null,
                                                    }))}
                                                    placeholder="Enter hard code function"
                                                    style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                                    className="w-full px-4 py-1 h-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition-all"
                                                />
                                            ) : ( */}
                                                <select
                                                    value={localNodeData.hardCodeFunction || ''}
                                                    onChange={(e) => setLocalNodeData((prev) => ({
                                                        ...prev,
                                                        hardCodeFunction: e.target.value || null,
                                                    }))}
                                                    style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                                    className="w-full px-4 py-1 h-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#373A6D] transition-all"
                                                >
                                                    <option value="">Select an agent</option>
                                                    {getFilteredAgentDisplayNames(nodes, localNodeData).map((displayName, index) => (
                                                        <option key={index} value={displayName}>
                                                            {displayName}
                                                        </option>
                                                    ))}
                                                </select>
                                            {/* )} */}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <div
                        style={{ backgroundColor: colors.backgroundSecondary, border: `1px solid ${colors.borderColor}` }}
                        className="rounded-2xl p-4"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-md font-semibold">Conditions</h3>
                            <button
                                onClick={() => handleAddCondition()}
                                style={{ backgroundColor: colors.backgroundSecondary }}
                                className="p-2 rounded-md hover:bg-gray-200 transition-colors flex items-center justify-center"
                                title="Add new condition"
                            >
                                <Plus className="w-5 h-5 text-blue-500" />
                            </button>
                        </div>
                        {localNodeData.condition.length > 0 ? (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {localNodeData.condition.map((condition, index) => (
                                    <div key={index} className="mb-2">
                                        <button
                                            onClick={() => openConditionModal(index)}
                                            style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                                            className="w-full flex items-center justify-between px-3 py-1 h-9 rounded-lg hover:bg-white/20 transition-colors text-left"
                                        >
                                            <span className="text-sm">
                                                {nodeData?.displayAgentName || nodeData?.agentName || "No Name"} → {getAgentDisplayName(condition.executeUserAgent, nodes) || 'None'}
                                            </span>
                                            <Edit2 size={16} className="text-yellow-500" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No conditions set.</p>
                        )}
                    </div>
                </div>

                <div className="flex gap-4 p-4">
                    <ReusableButton
                        onClick={handleSubmit}
                        icon={Save}
                        label="Update"
                        className="flex-1"
                    />
                    <button
                        onClick={onCancel}
                        style={{ backgroundColor: colors.backgroundPrimary, border: `1px solid ${colors.borderColor}` }}
                        className="px-4 py-1 h-9 rounded-md hover:opacity-80 transition-opacity flex-1"
                    >
                        Cancel
                    </button>
                </div>
            </div>

            {isModalOpen && (
                <ConditionModal
                    isOpen={isModalOpen}
                    conditionIndex={modalConditionIndex}
                    conditionData={modalConditionData}
                    handleFieldChange={handleModalFieldChange}
                    cancelEdits={cancelModalEdits}
                    localNodeData={localNodeData}
                    saveEdits={saveModalEdits}
                    nodes={nodes}
                />
            )}
        </>
    );
};

export default NodeEditorSidebar;

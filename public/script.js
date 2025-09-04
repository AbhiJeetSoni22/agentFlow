document.addEventListener("DOMContentLoaded", () => {
    const chatBox = document.getElementById("chat-box");
    const messageForm = document.getElementById("message-form");
    const messageInput = document.getElementById("message-input");

    // Replace with your server's WebSocket URL
    const ws = new WebSocket("ws://localhost:8080");

    ws.onopen = () => {
        console.log("Connected to WebSocket server");
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            const messageType = data.type;
            const message = data.message;
            
            // Display the message in the chat box
            if (messageType === "prompt" || messageType === "completion" || messageType === "error") {
                addMessageToChat(message, "bot");
            }
        } catch (error) {
            console.error("Failed to parse JSON message:", error);
            addMessageToChat("An unexpected error occurred.", "bot");
        }
    };

    ws.onclose = () => {
        console.log("Disconnected from WebSocket server");
    };

    ws.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    messageForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (message) {
            addMessageToChat(message, "user");
            ws.send(message);
            messageInput.value = "";
        }
    });

    function addMessageToChat(message, owner) {
        const messageElement = document.createElement("div");
        messageElement.classList.add("message", `${owner}-message`);
        messageElement.textContent = message;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});
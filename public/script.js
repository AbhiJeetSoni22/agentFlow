// public/script.js

document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const form = document.getElementById("chat-form");
  const input = document.getElementById("query-input");
  const messages = document.getElementById("messages");

  // Hardcoded values for simplicity
  const flowId = "68b5987f3cb5ad2a4deb861f";
  const userId = "webUser";

  let isFirstQuery = true; // Ye flag track karega ki kya ye pehli query hai

  function appendMessage(owner, message) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", owner);
    messageElement.textContent = message;
    messages.appendChild(messageElement);
    messages.scrollTop = messages.scrollHeight; // Scroll to bottom
  }

  // Handle form submission
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (input.value.trim()) {
      const userMessage = input.value.trim();
      appendMessage("user", userMessage);

      if (isFirstQuery) {
        socket.emit("startFlow", {
          flowId: flowId,
          initialQuery: userMessage,
          userId: userId,
        });
        isFirstQuery = false; // Pehli query ke baad flag ko false kar do
      } else {
        socket.emit("userResponse", userMessage);
      }
      input.value = "";
    }
  });

  // Listen for bot messages from the server
  socket.on("botMessage", (msg) => {
    appendMessage("bot", msg);
  });

  // Listen for prompt required event from the server
  socket.on("promptRequired", (prompt) => {
    appendMessage("bot", prompt);
    // User can now type in the input field
  });
});
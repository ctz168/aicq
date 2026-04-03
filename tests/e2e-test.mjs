/**
 * Direct end-to-end test: LLM → Tool Call → AICQ Server
 * Tests the full pipeline without OpenClaw gateway
 */

const MODELSCOPE_API = "https://api-inference.modelscope.cn/v1";
const MODELSCOPE_KEY = "ms-3eca52df-ea14-481b-9e72-73b988b612f7";
const AICQ_SERVER = "http://localhost:3000";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "chat-friend",
      description: "Manage encrypted chat friends: add/list/remove friends, request/revoke temp numbers. Max 200 friends.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "list", "remove", "request-temp-number", "revoke-temp-number"],
            description: "Action to perform on friends",
          },
          target: { type: "string", description: "6-digit temp number or friend ID" },
          limit: { type: "number", description: "Max friends to return" },
        },
        required: ["action"],
      },
    },
  },
];

async function callLLM(messages) {
  console.log("[LLM] Calling ModelScope API (Kimi-K2.5)...");
  const resp = await fetch(`${MODELSCOPE_API}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MODELSCOPE_KEY}`,
    },
    body: JSON.stringify({
      model: "ZhipuAI/GLM-5",
      messages,
      tools: TOOLS,
      max_tokens: 500,
    }),
  });
  const data = await resp.json();
  console.log("[LLM] Response received");
  return data;
}

async function ensureRegistered() {
  console.log("[TOOL] Ensuring agent node is registered...");
  await fetch(`${AICQ_SERVER}/api/v1/node/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "e2e-test-agent", publicKey: "ed25519-test-pub-key" }),
  });
}

async function executeTool(name, args) {
  console.log(`[TOOL] Executing: ${name}(${JSON.stringify(args)})`);
  switch (name) {
    case "chat-friend": {
      if (args.action === "request-temp-number") {
        await ensureRegistered();
        const resp = await fetch(`${AICQ_SERVER}/api/v1/temp-number/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId: "e2e-test-agent" }),
        });
        const data = await resp.json();
        console.log(`[TOOL] Result:`, data);
        return data;
      } else if (args.action === "list") {
        const resp = await fetch(`${AICQ_SERVER}/api/v1/friends?nodeId=e2e-test-agent`);
        const data = await resp.json();
        console.log(`[TOOL] Result:`, data);
        return data;
      }
      return { error: "Unknown action" };
    }
    default:
      return { error: "Unknown tool: " + name };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  AICQ E2E Test: LLM → Tool Call → AICQ Server");
  console.log("═══════════════════════════════════════════════\n");

  // Check AICQ server
  console.log("[CHECK] AICQ Server health...");
  try {
    const health = await fetch(`${AICQ_SERVER}/health`);
    const h = await health.json();
    console.log(`[CHECK] Server OK: ${h.domain}, uptime ${Math.round(h.uptime)}s\n`);
  } catch (e) {
    console.error("[ERROR] AICQ server not reachable! Start it first.");
    process.exit(1);
  }

  // Step 1: Ask LLM to call chat-friend tool
  console.log("[STEP 1] Sending prompt to LLM...");
  const messages = [
    { role: "system", content: "You are a helpful assistant with access to encrypted chat tools. Always call tools when asked. Respond concisely." },
    { role: "user", content: "请调用 chat-friend 工具，action 设为 request-temp-number，请求一个临时号码。只需要调用工具。" },
  ];

  const llmResult = await callLLM(messages);
  const choice = llmResult.choices?.[0];
  if (!choice) {
    console.error("[ERROR] No LLM response:", JSON.stringify(llmResult).slice(0, 500));
    process.exit(1);
  }

  const assistantMsg = choice.message;
  console.log(`[LLM] Response role: ${assistantMsg.role}`);
  console.log(`[LLM] Content: ${assistantMsg.content || "(empty, tool call)"}`);

  if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
    console.log(`[LLM] Tool calls: ${assistantMsg.tool_calls.length}`);
    
    for (const tc of assistantMsg.tool_calls) {
      console.log(`[LLM] Tool call: ${tc.function.name}(${tc.function.arguments})`);
      
      // Step 2: Execute the tool
      console.log("\n[STEP 2] Executing tool call...");
      const args = JSON.parse(tc.function.arguments);
      const toolResult = await executeTool(tc.function.name, args);
      
      // Step 3: Send tool result back to LLM
      console.log("\n[STEP 3] Sending tool result back to LLM...");
      messages.push(assistantMsg);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
      
      const finalResult = await callLLM(messages);
      const finalMsg = finalResult.choices?.[0]?.message;
      console.log(`[LLM] Final response: ${finalMsg?.content}`);
    }
  } else {
    console.log("[WARN] LLM did not call any tool");
    console.log("[LLM] Full response:", JSON.stringify(assistantMsg, null, 2));
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  ✅ E2E Test Complete!");
  console.log("═══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("[FATAL]", err.message || err);
  process.exit(1);
});

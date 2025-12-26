import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const MCP_PATH = "/mcp";
const todoHtml = readFileSync("public/todo-widget.html", "utf8");

let todos = [];
let nextId = 1;

const replyWithTodos = (message) => ({
  content: message ? [{ type: "text", text: message }] : [],
  structuredContent: { tasks: todos },
});

function createTodoServer() {
  const server = new McpServer({ name: "todo-app", version: "0.1.0" });

  // Widget resource (iframe)
  server.registerResource(
    "todo-widget",
    "ui://widget/todo.html",
    {},
    async () => ({
      contents: [
        {
          uri: "ui://widget/todo.html",
          mimeType: "text/html+skybridge",
          text: todoHtml,
          _meta: { "openai/widgetPrefersBorder": true },
        },
      ],
    })
  );

  // Tools
  server.registerTool(
    "add_todo",
    {
      title: "Add todo",
      description: "Creates a todo item with the given title.",
      inputSchema: z.object({ title: z.string().min(1) }),
      _meta: {
        "openai/outputTemplate": "ui://widget/todo.html",
        "openai/toolInvocation/invoking": "Adding todo",
        "openai/toolInvocation/invoked": "Added todo",
      },
    },
    async (args) => {
      const title = (args?.title ?? "").trim();
      if (!title) return replyWithTodos("Missing title.");

      const todo = { id: `todo-${nextId++}`, title, completed: false };
      todos = [...todos, todo];

      return replyWithTodos(`Added "${todo.title}".`);
    }
  );

  server.registerTool(
    "complete_todo",
    {
      title: "Complete todo",
      description: "Marks a todo item as complete.",
      inputSchema: z.object({ id: z.string().min(1) }),
      _meta: {
        "openai/outputTemplate": "ui://widget/todo.html",
        "openai/toolInvocation/invoking": "Completing todo",
        "openai/toolInvocation/invoked": "Completed todo",
      },
    },
    async (args) => {
      const id = (args?.id ?? "").trim();
      if (!id) return replyWithTodos("Missing id.");

      todos = todos.map((t) => (t.id === id ? { ...t, completed: true } : t));
      return replyWithTodos(`Completed "${id}".`);
    }
  );

  return server;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, mcp-session-id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname !== MCP_PATH) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  try {
    // set CORS headers for real requests too
    for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);

    const server = createTodoServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    res.writeHead(500, { ...corsHeaders, "content-type": "text/plain" });
    res.end(`Server error: ${err?.message ?? String(err)}`);
  }
});

const PORT = Number(process.env.PORT ?? 8787);
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ MCP server listening on http://localhost:${PORT}${MCP_PATH}`);
});

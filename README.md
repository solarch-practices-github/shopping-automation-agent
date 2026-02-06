This project aims to automate online shopping tasks using AI agents.
It's built with Google Agent Development Kit (ADK) for TypeScript/Node.js.


## References

- Follow the ADK TypeScript Quickstart to learn how to set up and run agents: https://google.github.io/adk-docs/get-started/typescript/

- Read the ADK Models & Authentication guide for model IDs and auth options: https://google.github.io/adk-docs/agents/models/

- Check Gemini API pricing for current model costs and tiers: https://ai.google.dev/pricing

- Check out [this](https://raw.githubusercontent.com/microsoft/playwright-mcp/refs/heads/main/README.md) page to learn more about Playwright MCP its tools and config options.

## Run locally

Create `.env` with the following variables:

```
GEMINI_API_KEY=your_gemini_api_key_here
CHROME_EXECUTABLE_PATH=your_path_to_chrome_here
```

Check `playwright-mcp.json`: make sure browser path is correct for your system.

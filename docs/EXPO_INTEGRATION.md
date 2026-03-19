# Expo App Integration

## Connect WebSocket
```typescript
const ws = new WebSocket("ws://YOUR_SERVER:3001");

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "pipeline_update") {
    // update UI
  }
};

// List available skills
ws.send(JSON.stringify({ type: "list_skills" }));

// Approve HITL
ws.send(JSON.stringify({ type: "approve", jobId: "job-xxx" }));

// Run a single skill manually
ws.send(JSON.stringify({
  type:      "run_skill",
  skillName: "research",
  input:     { date: "2026-03-16" },
  jobId:     "manual-001",
}));
```

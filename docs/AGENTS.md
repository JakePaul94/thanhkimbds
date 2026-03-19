# Kiến trúc Agent — Customer vs Supervisor

## Tổng quan

Hệ thống tách thành **2 agent** với quyền hạn và kênh tương tác khác nhau:

| Agent | Kênh | Quyền | Port WS |
|-------|------|-------|---------|
| **Customer Agent** | Web, Facebook, Zalo (sau này) | Chỉ chat (ChatSkill) | 3001 |
| **Supervisor Agent** | Expo | Full: chat, đăng bài, approve, reject | 3003 |

---

## Customer Agent

**Mục đích:** Tương tác trực tiếp với khách hàng qua nhiều kênh.

**Kênh:**
- **Web** — Chatbot trên landing page (WebSocket port 3001)
- **Facebook** — Webhook Messenger, tự động trả lời qua Customer Agent
- **Zalo** — (dự kiến) Webhook tương tự Facebook

**Quyền hạn:**
- Chỉ dùng `ChatSkill` — trả lời câu hỏi BĐS dựa trên Gemini + Qdrant
- Không tạo job, không đăng bài, không approve/reject

**File:**
- `src/agents/CustomerAgent.ts` — `customerAgentReply(message)`
- `src/gateway/CustomerGateway.ts` — WebSocket cho web
- `src/routes/facebookWebhook.ts` — Nhận tin nhắn, gọi Customer Agent, gửi reply qua Facebook Send API
- `src/services/FacebookSend.ts` — Gửi tin nhắn qua Graph API

---

## Supervisor Agent

**Mục đích:** Trợ lý cho nhân viên/supervisor qua Expo — full quyền như một trợ lý nội bộ.

**Kênh:**
- **Expo app** — WebSocket port 3002

**Quyền hạn:**
- `AgentChatSkill` — Chat nội bộ, tìm kiếm Qdrant, Tavily news
- `request_post` — Tạo job viết bài (idea → research → writer → image → video → HITL)
- `approve` / `reject` — Duyệt bài trước khi đăng Facebook
- `run_skill` — Chạy skill tùy chọn

**File:**
- `src/gateway/ExpoGateway.ts` — WebSocket cho Expo
- `src/gateway/expoBroadcast.ts` — Broadcast job_ready_for_review tới Expo

---

## Cấu hình

```env
# Customer (web, Facebook)
WS_CUSTOMER_PORT=3001

# Supervisor (Expo) — 3002 dành cho Next.js web
WS_SUPERVISOR_PORT=3003
```

**Port layout:**
- 3000: HTTP API (agent)
- 3001: WS Customer (web chatbot)
- 3002: Next.js web
- 3003: WS Supervisor (Expo)

**Web (.env):**
```
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

**Expo (config.ts):**
```ts
WS_URL = `ws://${API_HOST}:3003`
```

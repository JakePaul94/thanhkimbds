# Workflow BĐS — Morning Content Agent

## Tổng quan

Mỗi sáng **6:00 ICT**, agent tự động chạy pipeline tạo bài post Bất động sản:

1. **Ý tưởng** — Brainstorm (tin tức / sản phẩm / kinh nghiệm) — luân phiên theo ngày
2. **Research** — Tìm tin thị trường BĐS qua Tavily
3. **Viết caption** — Claude viết caption Facebook + Zalo
4. **Tạo ảnh** — Thumbnail
5. **Tạo video** — Kling/Runway
6. **HITL** — Gửi bài mẫu qua **Expo app** cho human duyệt
7. **Đăng bài** — Nếu duyệt → Facebook + Zalo

## Chạy

```bash
# 1. Khởi động infra
bun run infra:up

# 2. Chạy agent
bun run dev

# 3. Chạy Expo app (duyệt bài trên điện thoại)
bun run expo

# 4. Chạy web landing (Thank Kim BĐS)
bun run web
```

## Test flow: Tin tức → Viết bài → Human duyệt

Flow test: search tin tức mới nhất BĐS → viết caption → **bỏ qua video** → gửi bài mẫu qua Expo cho human duyệt.

```bash
# 1. Đảm bảo agent đang chạy (bun run dev)
# 2. Đảm bảo Expo app đang mở (tab "Duyệt bài")
# 3. Trigger test flow
bun run trigger:test
# hoặc: curl -X POST http://localhost:3000/trigger/test
```

Pipeline chạy: **Idea** (tin_tuc) → **Research** (Tavily) → **Writer** (caption) → **Image** (thumbnail) → *(bỏ qua Video)* → **HITL** (gửi Expo). Khi tới HITL, bài mẫu hiện trên Expo app để duyệt.

## Web Landing — Thank Kim Bất động sản

- **URL:** http://localhost:3002
- **Cấu hình:** `web/.env.local` — `NEXT_PUBLIC_AGENT_URL`, `NEXT_PUBLIC_WS_URL`
- **Chatbot:** Kết nối WS tới agent, dùng ChatSkill + memory trả lời câu hỏi BĐS
- **Posts:** Lấy từ `GET /api/posts` (DB agent — content_drafts)

## Expo App

- Kết nối WebSocket `ws://localhost:3001` (đổi IP khi dùng thiết bị thật)
- Nhận bài mẫu real-time khi pipeline tới bước HITL
- **Duyệt đăng** → pipeline tiếp tục đăng Facebook + Zalo
- **Từ chối** → dừng, không đăng

## AI — Gemini

Dùng **Gemini API** (thay Anthropic + OpenAI). Lấy key tại [Google AI Studio](https://aistudio.google.com/apikey).

```bash
GEMINI_API_KEY=your_key
```

**Lưu ý:** Qdrant dùng `gemini-embedding-001` (3072 dim). Nếu trước đây dùng OpenAI (1536 dim), cần xóa collection cũ: `curl -X DELETE http://localhost:6333/collections/agent_memory`

## Cấu hình Expo (thiết bị thật)

```bash
cd expo-app
EXPO_PUBLIC_API_HOST=192.168.1.100 npm start
```

Thay `192.168.1.100` bằng IP máy chạy agent.

## Thể loại ý tưởng (luân phiên)

| Ngày | Thể loại |
|------|----------|
| 0, 3, 6... | Tin tức thị trường BĐS |
| 1, 4, 7... | Giới thiệu sản phẩm/dự án |
| 2, 5, 8... | Kinh nghiệm mua bán, đầu tư |

# Kiến trúc Intent Router — Agent Supervisor

## Tổng quan

Thay vì regex hardcode, agent dùng **LLM (Gemini)** để phân loại intent từ tin nhắn. Mỗi intent map tới 1 handler/skill riêng.

## Các intent

| Intent | Mô tả | Handler |
|--------|-------|---------|
| `write_post_product` | Viết bài giới thiệu BĐS cụ thể (căn, nhà, đất) | `handleRequestPost` + tìm property, hỏi lại nếu nhiều kết quả |
| `write_post_experience` | Viết bài kinh nghiệm, triết lý kinh doanh BĐS | `handleRequestPost` với `forceCategory: kinh_nghiem` |
| `write_post_news` | Viết bài tin tức thị trường | `handleRequestPost` với `forceCategory: tin_tuc` |
| `write_post_news_video` | Tin tức + video | Giống trên, `skipVideo: false` |
| `track_posts` | Theo dõi bài đăng | Trả lời: "Vào Menu → Theo dõi bài đăng" |
| `analyze_engagement` | Phân tích tương tác | Trả lời (tính năng đang phát triển) |
| `cost_stats` | Thống kê chi phí | Trả lời: "Vào Menu → Theo dõi chi phí" |
| `list_properties` | Xem danh sách BĐS | Trả lời: "Vào Menu → Quản lý bất động sản" |
| `chat` | Hỏi đáp thông thường | `AgentChatSkill` (Qdrant + Tavily + Gemini) |

## Luồng viết bài sản phẩm (clarification)

1. User: "viết bài về căn Trương Định"
2. IntentRouter → `write_post_product`, `extractedTopic: "Trương Định"`
3. `searchPropertyByQuery("Trương Định")` → 3 kết quả
4. Lưu `pending_property_choice:{supervisorId}` (Redis, TTL 5 phút)
5. Trả lời: "Em tìm thấy 3 căn: 1) Căn A - 2 tỷ, 2) Căn B - 3 tỷ... Sếp chọn căn nào (1, 2 hoặc 3)?"
6. User: "căn 2"
7. Parse `parseChoiceIndex("căn 2")` → index 1
8. Lấy property đã chọn → tạo job viết bài

## Thêm intent mới

1. Thêm vào `src/intents/types.ts` (SupervisorIntent)
2. Thêm prompt trong `IntentRouter.ts` (INTENT_PROMPT)
3. Thêm fallback regex trong `fallbackClassify()` (khi LLM lỗi)
4. Thêm case trong `routeByIntent()` → gọi skill/handler tương ứng

## Skill riêng vs handler inline

- **Handler inline**: Trả lời ngắn, hướng dẫn user (vd: track_posts, cost_stats)
- **Skill riêng**: Logic phức tạp, gọi API, xử lý dữ liệu (vd: AgentChatSkill, handleRequestPost)

Khi cần logic phức tạp (phân tích engagement, thống kê từ DB), tạo skill mới trong `src/skills/` và đăng ký trong `registerAll.ts`.

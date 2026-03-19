# Morning Content Agent — Architecture

## Skill-based Design
Mỗi capability là 1 `Skill` độc lập, không phải Agent.
Orchestrator chạy danh sách Skill theo thứ tự (pipeline).

## Skills
| Skill            | Mô tả                                  |
|------------------|----------------------------------------|
| `research`       | Tìm trend qua Tavily API               |
| `writer`         | Sinh caption bằng Claude Sonnet        |
| `image_gen`      | Tạo ảnh bằng Flux API                  |
| `video_gen`      | Tạo video Kling AI (fallback Runway)   |
| `facebook_post`  | Đăng FB cá nhân qua Playwright CDP     |
| `zalo_post`      | Đăng Zalo cá nhân qua Playwright CDP   |
| `memory_search`  | Tìm kiếm Qdrant long-term memory       |
| `memory_save`    | Lưu vào Qdrant long-term memory        |

## Memory
- **Short** (Redis): Job context trong 1 pipeline run, TTL 24h
- **Long** (Qdrant): Vector memory xuyên suốt — past posts, style, tone

## HITL Gateway
- Pipeline tự pause sau `video_gen`
- Telegram notify admin → inline buttons
- Expo app kết nối qua WebSocket → approve/reject/edit

## Expo Gateway
WebSocket server tại `ws://localhost:3001`
- `run_skill` — gọi bất kỳ skill nào từ app
- `approve/reject` — HITL từ mobile
- `pipeline_update` — realtime broadcast

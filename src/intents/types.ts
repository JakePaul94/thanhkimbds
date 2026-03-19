/**
 * Các intent mà agent có thể nhận diện.
 * Mỗi intent map tới 1 handler/skill riêng.
 */
export type SupervisorIntent =
  | "write_post_product"    // Viết bài giới thiệu BĐS (tìm property, hỏi lại nếu nhiều kết quả)
  | "write_post_experience" // Viết bài kinh nghiệm, triết lý kinh doanh BĐS
  | "write_post_news"       // Viết bài tin tức thị trường
  | "write_post_news_video" // Tin tức + video
  | "track_posts"           // Theo dõi bài đăng
  | "analyze_engagement"    // Phân tích tương tác
  | "cost_stats"            // Thống kê chi phí
  | "list_properties"       // Xem danh sách BĐS
  | "chat";                 // Hỏi đáp thông thường

export type IntentResult = {
  intent: SupervisorIntent;
  /** Tham số trích xuất từ tin nhắn (vd: "căn Trương Định", "kinh nghiệm mua nhà") */
  extractedTopic?: string;
  /** Có yêu cầu tạo video không */
  skipVideo?: boolean;
};

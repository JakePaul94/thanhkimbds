import { pgTable, text, timestamp, jsonb, integer, real, unique } from "drizzle-orm/pg-core";

export const workflowJobs = pgTable("workflow_jobs", {
  id:        text("id").primaryKey(),
  state:     text("state").notNull().default("PENDING"),
  topic:     text("topic"),
  publishAt: timestamp("publish_at"),
  context:   jsonb("context").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const contentDrafts = pgTable("content_drafts", {
  id:        text("id").primaryKey(),
  jobId:     text("job_id").notNull(),
  version:   integer("version").default(1),
  facebook:  text("facebook"),
  zalo:      text("zalo"),
  imageUrl:  text("image_url"),
  videoUrl:  text("video_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hitlEvents = pgTable("hitl_events", {
  id:        text("id").primaryKey(),
  jobId:     text("job_id").notNull(),
  action:    text("action").notNull(),
  payload:   jsonb("payload").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const properties = pgTable("properties", {
  id:           text("id").primaryKey(),
  title:        text("title").notNull(),
  price:        text("price"),
  area:         text("area"),
  address:      text("address"),
  district:     text("district"),
  description:  text("description"),
  features:     jsonb("features").default([]),
  contactPhone: text("contact_phone"),
  imageUrls:    jsonb("image_urls").default([]),
  videoUrl:     text("video_url"),
  // Chi tiết thêm
  bedrooms:     text("bedrooms"),
  bathrooms:    text("bathrooms"),
  floors:       text("floors"),
  frontage:     text("frontage"),
  direction:    text("direction"),
  legalStatus:  text("legal_status"),
  interior:     text("interior"),
  // Định vị (lat, lng)
  latitude:     real("latitude"),
  longitude:    real("longitude"),
  createdAt:    timestamp("created_at").defaultNow(),
  updatedAt:    timestamp("updated_at").defaultNow(),
});

export const publishedPosts = pgTable("published_posts", {
  id:             text("id").primaryKey(),
  jobId:          text("job_id").notNull(),
  platform:       text("platform").notNull(),
  platformPostId: text("platform_post_id"),
  publishedAt:    timestamp("published_at").defaultNow(),
});

/** Người dùng (web customer, supervisor expo, facebook, zalo) */
export const users = pgTable("users", {
  id:        text("id").primaryKey(),
  platform:  text("platform").notNull(), // web | supervisor_expo | facebook | zalo
  metadata:  jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Lịch sử chat — customer (web) và supervisor (expo) */
export const chatHistory = pgTable("chat_history", {
  id:        text("id").primaryKey(),
  userId:    text("user_id").notNull().references(() => users.id),
  role:      text("role").notNull(), // user | bot
  message:   text("message").notNull(),
  platform:  text("platform").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Lịch đăng bài — cấu hình cron mỗi ngày */
export const cronSchedules = pgTable("cron_schedules", {
  id:             text("id").primaryKey(),
  name:           text("name").notNull(),
  cronExpression: text("cron_expression").notNull(), // "0 6 * * *" = 6:00 AM mỗi ngày
  enabled:        integer("enabled").notNull().default(1), // 1 = bật, 0 = tắt
  forceCategory:  text("force_category"), // tin_tuc | san_pham | kinh_nghiem
  forceTopic:     text("force_topic"),    // để trống = LLM sinh ý tưởng
  skipVideo:      integer("skip_video").notNull().default(1), // 1 = bỏ qua video
  forcePropertyId:text("force_property_id"), // BĐS cụ thể (san_pham)
  lastRunAt:      timestamp("last_run_at"),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
});

/** Lịch sử tin nhắn Facebook Messenger (từ webhook) */
export const facebookMessages = pgTable(
  "facebook_messages",
  {
    id:           text("id").primaryKey(),
    messageId:   text("message_id").notNull(),
    senderId:    text("sender_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    text:        text("text"),
    attachments: jsonb("attachments").default([]),
    timestamp:   timestamp("timestamp").notNull(),
    createdAt:   timestamp("created_at").defaultNow(),
  },
  (t) => [unique("facebook_messages_message_id_unique").on(t.messageId)]
);

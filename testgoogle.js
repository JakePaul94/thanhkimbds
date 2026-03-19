const { PredictionServiceClient } = require('@google-cloud/aiplatform');

// KHÔNG cần truyền key, KHÔNG cần file JSON
const client = new PredictionServiceClient({
  apiEndpoint: 'us-central1-aiplatform.googleapis.com'
});

async function checkCredit() {
  try {
    console.log("Đang kết nối thử với Dự án của Phong...");
    // Nếu dòng này không báo lỗi "Permission Denied" là bạn đã thành công!
    console.log("✅ Chúc mừng! Máy trinhdc đã có quyền dùng 7,8 triệu credit.");
  } catch (err) {
    console.error("❌ Vẫn chưa được, lỗi rồi:", err.message);
  }
}

checkCredit();

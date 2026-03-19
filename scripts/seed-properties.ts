import "dotenv/config";
import { v4 as uuid } from "uuid";
import * as props from "../src/db/queries/properties";

const testProperties = [
  {
    title: "6.3 Tỷ-25m2 - 5 TẦNG 3PN -Bạch Mai-PHỐ HUẾ-HBT- 0985826871",
    price: "6.3 tỷ",
    area: "25m²",
    address: "Bạch Mai, Chùa Liên Phái, cách phố chỉ 30m",
    district: "Hai Bà Trưng",
    description: `✨ Nhà đẹp Bạch Mai – Chùa Liên Phái, cách phố chỉ 30m, ngõ nông ba gác tránh.
🏠 Thiết kế 5 tầng hiện đại, 3 phòng ngủ khép kín.
📍 Vị trí đắc địa gần Phố Huế, khu Bách - Kinh - Xây; tặng full nội thất
⚖️ Sổ đỏ chính chủ, pháp lý sạch, sẵn sàng bàn giao ngay.
💥 Thanh Kim BĐS F0 – Nói không với quy hoạch
📌 Nhận ký gửi mua bán BĐS phí 1%
📌 Hỗ trợ: check quy hoạch – vay ngân hàng – xây sửa trọn gói – xin phép xây dựng – làm sổ đỏ, hợp thửa/tách thửa`,
    contactPhone: "0985826871",
  },
  {
    title: "Hơn 9 tỷ - 4 TẦNG LÔ GÓC-5 PHÒNG-FULL NỘI THẤT-HỒNG MAI-BẠCH MAI-HBT-HN (Thương lượng mạnh)-0985826871",
    price: "Hơn 9 tỷ",
    area: undefined,
    address: "Hồng Mai, ngay nút giao Hồng Mai-Bạch Mai",
    district: "Hai Bà Trưng",
    description: `*Nhà lô góc có mặt tiền là 3.3m, nằm tại Hồng Mai, ngay nút giao Hồng Mai-Bạch Mai (Hai Bà Trưng, HN), ngõ thông sang Hòa Bình 7 và Minh Khai.
-Ngõ trước nhà rộng rãi xe máy quay đầu, ba gác đỗ cửa, thoáng ánh sáng, từ nhà ra phố Hồng Mai rất gần, cách chứng 10 nhà.
-Gần Chợ Mơ, ĐH Bách Khoa- Kinh Tế- Xây Dựng. Quanh nhà trường học các cấp, công viên. Và nhiều bãi gửi xe. Rất thuận tiện ở và sinh hoạt.
-Chủ tặng đầy đủ tất cả nội thất cho khách gồm: Điều hoà, nóng lạnh, tivi, tủ lạnh, sofa, bàn ăn, bếp từ, hút mùi, dàn năng lượng mặt trời, vv và mây mưa. Nói chung khách hàng chỉ việc xách vali vào ở mà không phải sắm thêm bất cứ thứ gì.
* Thiết kế:
+ Tầng 1: Sân để xe + phòng khách + bếp + vs
+ Tầng 2,3: Mỗi tầng 2 phòng ngủ + wc
+ Tầng 4: phòng thờ + sân tiểu cảnh 
*Sổ đỏ vuông vắn không lỗi phong thủy- sẵn sàng GD
*Thanh Kim BDS F0- Nói không với QH- Ngoài ra em còn nhận ký gửi BDS`,
    contactPhone: "0985826871",
  },
];

async function main() {
  for (const p of testProperties) {
    const id = `prop-${Date.now()}-${uuid().slice(0, 8)}`;
    await props.createProperty({
      id,
      title: p.title,
      price: p.price,
      area: p.area,
      address: p.address,
      district: p.district,
      description: p.description,
      contactPhone: p.contactPhone,
    });
    console.log(`✓ Đã thêm: ${p.title.slice(0, 50)}...`);
  }
  console.log(`\nĐã lưu ${testProperties.length} BĐS vào DB.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

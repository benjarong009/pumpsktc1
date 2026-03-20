# ⛽ PumpSKTC — ปั๊มไหนมีน้ำมัน?

เว็บรายงานสถานะน้ำมันจากประชาชน แบบ real-time

## โครงสร้างไฟล์

```
pumpsktc/
├── server.js          ← Express API server
├── database.js        ← MongoDB (Mongoose)
├── package.json
├── users.json         ← ข้อมูลผู้ใช้ / admin
├── announcement.json  ← ประกาศข่าวด่วน
├── index.html         ← หน้าหลัก (Dark theme + แผนที่)
└── admin.html         ← Admin Panel
```

## วิธีรันในเครื่อง

```bash
npm install
MONGO_URI=mongodb+srv://... npm start
```

## Deploy บน Render

ตั้ง Environment Variable:
- `MONGO_URI` = MongoDB Atlas connection string
- `PORT` = 3000

## บัญชีเริ่มต้น

| Role  | Username | Password   |
|-------|----------|------------|
| Admin | admin    | admin1234  |
| User  | user1    | 1234       |

⚠️ **เปลี่ยนรหัสผ่านหลัง deploy ด้วยนะครับ!**

## API Endpoints

| Method | URL | คำอธิบาย |
|--------|-----|----------|
| POST | `/api/register` | สมัครสมาชิก |
| POST | `/api/login` | เข้าสู่ระบบ |
| POST | `/api/admin/login` | Admin login |
| GET | `/api/reports` | ดึงรายงาน |
| POST | `/api/reports` | เพิ่มรายงาน (ต้อง login) |
| PATCH | `/api/reports/:id/upvote` | โหวต +1 |
| DELETE | `/api/reports/:id` | ลบ (Admin only) |
| GET | `/api/stats` | สถิติ |
| GET | `/api/map` | พิกัดปั๊มทั้งหมด |
| GET | `/api/announcement` | ดูประกาศ |
| POST | `/api/admin/announcement` | ตั้งประกาศ (Admin) |
| GET | `/api/admin/users` | จัดการผู้ใช้ (Admin) |
| PATCH | `/api/admin/users/:u/ban` | แบน/ยกเลิกแบน (Admin) |
| DELETE | `/api/admin/users/:u` | ลบผู้ใช้ (Admin) |
| DELETE | `/api/admin/cleanup` | ล้างรายงานเก่า >7 วัน (Admin) |

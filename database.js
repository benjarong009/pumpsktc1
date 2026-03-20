const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost/pumpsktc';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ── SCHEMA ────────────────────────────────────────────────────────────────────
const reportSchema = new mongoose.Schema({
  id:          { type: String, default: () => require('crypto').randomUUID() },
  station:     { type: String, required: true },
  brand:       { type: String, default: 'อื่นๆ' },
  status:      { type: String, required: true },
  fuel_types:  { type: [String], default: [] },
  province:    { type: String, required: true },
  lat:         { type: Number, default: null },
  lng:         { type: Number, default: null },
  comment:     { type: String, default: '' },
  upvotes:     { type: Number, default: 0 },
  reported_by: { type: String, default: '' },
  created_at:  { type: Date,   default: Date.now },
});

const Report = mongoose.model('Report', reportSchema);

// ── SEED (รันครั้งแรกเท่านั้น) ───────────────────────────────────────────────
async function seedIfEmpty() {
  const count = await Report.countDocuments();
  if (count > 0) return;
  await Report.insertMany([
    { station:'ปตท. อรัญประเทศ (ถ.สุวรรณศร)', brand:'ปตท.', status:'มีน้ำมัน',    fuel_types:['ดีเซล','เบนซิน 91','เบนซิน 95','E20'], province:'สระแก้ว', lat:13.7063, lng:102.5042, comment:'เปิดปกติ คิวไม่นาน', upvotes:8 },
    { station:'บางจาก วังน้ำเย็น',              brand:'บางจาก', status:'ไม่มีน้ำมัน', fuel_types:['ดีเซล','เบนซิน 91'],                   province:'สระแก้ว', lat:13.4608, lng:102.1658, comment:'น้ำมันหมดทุกชนิด รอรถเติมพรุ่งนี้', upvotes:14 },
    { station:'ปตท. เมืองสระแก้ว (ถ.สุวรรณศร)', brand:'ปตท.', status:'คิวยาว',       fuel_types:['ดีเซล B7','เบนซิน 95'],                  province:'สระแก้ว', lat:13.8200, lng:102.0650, comment:'คิวยาวประมาณ 40 นาที', upvotes:6 },
    { station:'เชลล์ อรัญประเทศ',               brand:'เชลล์', status:'มีน้ำมัน',    fuel_types:['ดีเซล','เบนซิน 91','LPG'],               province:'สระแก้ว', lat:13.6980, lng:102.5110, comment:'เปิดปกติ มีทุกชนิด', upvotes:3 },
    { station:'ซัสโก้ คลองหาด',                 brand:'ซัสโก้', status:'มีน้ำมัน',   fuel_types:['ดีเซล','เบนซิน 91'],                    province:'สระแก้ว', lat:13.6248, lng:102.2430, comment:'', upvotes:2 },
    { station:'คาลเท็กซ์ วัฒนานคร',             brand:'คาลเท็กซ์', status:'ไม่มีน้ำมัน', fuel_types:['ดีเซล'],                           province:'สระแก้ว', lat:13.7842, lng:102.3012, comment:'ดีเซลหมดตั้งแต่เช้า', upvotes:11 },
    { station:'ปตท. ตาพระยา',                   brand:'ปตท.', status:'มีน้ำมัน',    fuel_types:['ดีเซล','เบนซิน 91','E20'],               province:'สระแก้ว', lat:14.1077, lng:102.7892, comment:'เปิดปกติ ไม่มีปัญหา', upvotes:5 },
  ]);
  console.log('✅ Seeded 7 sample reports');
}
seedIfEmpty();

// ── DB METHODS ────────────────────────────────────────────────────────────────
const db = {

  async getReports({ status, province, limit = 50, offset = 0 } = {}) {
    const filter = {};
    if (status)   filter.status = status;
    if (province) filter.province = province;
    const total   = await Report.countDocuments(filter);
    const reports = await Report.find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
    return { reports, total };
  },

  async getReport(id) {
    return Report.findOne({ id }).lean();
  },

  async addReport(data) {
    const r = await Report.create(data);
    return r.toObject();
  },

  async upvote(id) {
    return Report.findOneAndUpdate(
      { id },
      { $inc: { upvotes: 1 } },
      { new: true }
    ).lean();
  },

  async deleteReport(id) {
    const r = await Report.deleteOne({ id });
    return r.deletedCount > 0;
  },

  async deleteOlderThan(days) {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const r = await Report.deleteMany({ created_at: { $lt: cutoff } });
    return r.deletedCount;
  },

  async getStats() {
    const reports = await Report.find().lean();
    const byProvince = {};
    const byBrand    = {};
    reports.forEach(r => {
      // province
      if (!byProvince[r.province])
        byProvince[r.province] = { province: r.province, total: 0, avail: 0, unavail: 0, queue: 0 };
      byProvince[r.province].total++;
      if (r.status === 'มีน้ำมัน')    byProvince[r.province].avail++;
      if (r.status === 'ไม่มีน้ำมัน') byProvince[r.province].unavail++;
      if (r.status === 'คิวยาว')      byProvince[r.province].queue++;
      // brand
      byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
    });
    return {
      total:   reports.length,
      avail:   reports.filter(r => r.status === 'มีน้ำมัน').length,
      unavail: reports.filter(r => r.status === 'ไม่มีน้ำมัน').length,
      queue:   reports.filter(r => r.status === 'คิวยาว').length,
      byProvince: Object.values(byProvince).sort((a, b) => b.total - a.total),
      byBrand: Object.entries(byBrand)
        .map(([brand, total]) => ({ brand, total }))
        .sort((a, b) => b.total - a.total),
    };
  },

  async getMapPoints() {
    return Report.find({ lat: { $ne: null }, lng: { $ne: null } }).lean();
  },
};

module.exports = db;

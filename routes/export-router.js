const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const prisma = require("../models/prisma");

const router = express.Router();

router.post('/exportpdf', async (req, res) => {
  const data = req.body;

  const doc = new PDFDocument({ size: [841.89, 1400], margin: 50 });
  let buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfData = Buffer.concat(buffers);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=export-${data.date}.pdf`,
      'Content-Length': pdfData.length,
    });
    res.end(pdfData);
  });

  const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
  const fontBold = path.join(__dirname, '../fonts/THSarabunNewBold.ttf');
  if (fs.existsSync(fontPath)) doc.registerFont('thai', fontPath).font('thai');
  if (fs.existsSync(fontBold)) doc.registerFont('thai-bold', fontBold);

  const logoPath = path.join(__dirname, '../picture/S__5275654png (1).png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 50, { width: 80 });
  }

  doc.font('thai-bold').fontSize(26).text(
    'ใบส่งออกทุเรียน SAIJAITHAM / Durian Export Invoice - SAIJAITHAM',
    0, 50, { align: 'center' }
  );

  doc.font('thai-bold').fontSize(20).text(`วันที่ / Date: ${data.date}`, 150, 150);
  doc.text(`ปลายทาง / Destination: ${data.city}`);
  doc.text(`ตู้ / Container: ${data.containerInfo}`);
  doc.text(`รหัสตู้ / Container Code: ${data.containerCode}`);
  doc.text(`รหัสอ้างอิง / Reference Code: ${data.refCode}`);
  doc.moveDown();

  doc.font('thai-bold').fontSize(24).text('รายการทุเรียน / Durian Items', { underline: true });
  doc.moveDown();
  doc.font('thai-bold').fontSize(18);
  data.durianItems.forEach((item, i) => {
    const totalWeight = item.boxes * item.weightPerBox;
    const totalPrice = totalWeight * item.pricePerKg;
    doc.text(`${i + 1}. ${item.variety} เกรด ${item.grade} | ${item.boxes} กล่อง × ${item.weightPerBox} กก. = ${totalWeight} กก. × ${item.pricePerKg} บาท = ${totalPrice.toLocaleString()} บาท`);
  });

  if (data.freightItems?.length) {
    doc.moveDown().font('thai-bold').fontSize(24).text('ค่าน้ำหนักซิ / Freight Charges', { underline: true });
    data.freightItems.forEach((item, i) => {
      const subtotal = item.weight * item.pricePerKg;
      doc.font('thai-bold').fontSize(18).text(
        `${i + 1}. ${item.variety} เกรด ${item.grade} | น้ำหนัก ${item.weight} กก. × ${item.pricePerKg} บาท = ${subtotal.toLocaleString()} บาท`
      );
    });
  }

  doc.moveDown().font('thai-bold').fontSize(24).text('ค่าจัดการกล่อง / Handling Costs');
  Object.entries(data.handlingCosts).forEach(([size, cost]) => {
    const total = cost.weight * cost.costPerKg;
    doc.font('thai-bold').fontSize(18).text(
      `${size}: น้ำหนักรวม ${cost.weight} กก. × ${cost.costPerKg} บาท = ${total.toLocaleString()} บาท`
    );
  });

  doc.moveDown().font('thai-bold').fontSize(24).text('ค่ากล่อง / Box Costs');
  Object.entries(data.boxCosts).forEach(([size, box]) => {
    const total = box.quantity * box.unitCost;
    doc.font('thai-bold').fontSize(18).text(`${size}: ${box.quantity} กล่อง × ${box.unitCost} = ${total.toLocaleString()} บาท`);
  });

  doc.moveDown().font('thai-bold').fontSize(24).text(`ค่าตรวจสาร / Inspection Fee: ${data.inspectionFee.toLocaleString()} บาท`);

  let total = data.inspectionFee;
  Object.values(data.handlingCosts).forEach(c => {
    total += c.weight * c.costPerKg;
  });
  Object.values(data.boxCosts).forEach(c => {
    total += c.quantity * c.unitCost;
  });
  data.durianItems.forEach(d => {
    total += d.boxes * d.weightPerBox * d.pricePerKg;
  });
  data.freightItems?.forEach(item => {
    total += item.weight * item.pricePerKg;
  });

  doc.moveDown().font('thai-bold').fontSize(26).text(`รวมยอด / Total: ${total.toLocaleString()} บาท`, { align: 'right' });
  doc.moveDown(1);

  if (data.brandSummary?.trim()) {
    doc.font('thai-bold').fontSize(28).text('สรุปกล่องตามแบรนด์ / Brand-wise Box Summary', { underline: true, align: 'center' });
    doc.moveDown();
    doc.font('thai-bold').fontSize(20).text(data.brandSummary);
  }

  doc.end();
});








router.post('/', async (req, res) => {
  try {
    function toDateOnly(d) {
      const dt = new Date(d);
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }

    const billDate = toDateOnly(new Date(req.body.date));
    const season = await prisma.season.findFirst({
      where: {
        startDate: { lte: billDate },
        OR: [
          { endDate: null },
          { endDate: { gte: billDate } },
        ],
      },
    });

    const newExport = await prisma.exportContainer.create({
      data: {
        ...req.body,
        seasonId: season?.id || null,
      },
    });

    res.json(newExport);
  } catch (err) {
    console.error("❌ POST /v1/export error::", err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึก', details: err });
  }
});

// ✅ READ ALL: รองรับ ?seasonId=...
router.get('/', async (req, res) => {
  try {
    const seasonId = parseInt(req.query.seasonId);
    const exports = await prisma.exportContainer.findMany({
      where: seasonId ? { seasonId } : {},
      orderBy: { date: 'desc' },
    });
    res.json(exports);
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงรายการได้', details: err });
  }
});

// ✅ READ ONE
router.get('/:id', async (req, res) => {
  try {
    const exportDoc = await prisma.exportContainer.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    res.json(exportDoc);
  } catch (err) {
    res.status(500).json({ error: 'ไม่พบเอกสารนี้', details: err });
  }
});


// ✅ UPDATE พร้อมคำนวณ seasonId ใหม่
router.put('/:id', async (req, res) => {
  try {
    function toDateOnly(d) {
      const dt = new Date(d);
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }

    const billDate = toDateOnly(new Date(req.body.date));
    const season = await prisma.season.findFirst({
      where: {
        startDate: { lte: billDate },
        OR: [
          { endDate: null },
          { endDate: { gte: billDate } },
        ],
      },
    });

    const updated = await prisma.exportContainer.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...req.body,
        seasonId: season?.id || null,
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'อัปเดตไม่สำเร็จ', details: err });
  }
});

// DELETE: ลบเอกสารตาม ID
router.delete('/:id', async (req, res) => {
  try {
    await prisma.exportContainer.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: 'ลบไม่สำเร็จ', details: err });
  }
});


























router.get("/summarypdf", async (req, res) => {
  const seasonId = parseInt(req.query.seasonId);
  if (!seasonId) return res.status(400).send("seasonId required");

  try {
    console.log("📌 เริ่มสร้าง PDF สำหรับ seasonId:", seasonId);

    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    console.log("✅ Season:", season);

    const exports = await prisma.exportContainer.findMany({ where: { seasonId } });
    console.log("✅ พบ export:", exports.length);

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=summary-season-${seasonId}.pdf`,
        "Content-Length": pdfData.length,
      });
      res.end(pdfData);
    });

    doc.on("error", (err) => {
      console.error("❌ PDFKit generation error:", err);
    });

    // บันทึกไฟล์ชั่วคราวสำหรับตรวจสอบ (option)
    const out = fs.createWriteStream(`debug-summary-${seasonId}.pdf`);
    doc.pipe(out);

    doc.fontSize(20).text(`📦 รายงานสรุปการส่งออกทุเรียน - ฤดูกาล ${season.name}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(
      `ช่วงเวลา: ${new Date(season.startDate).toLocaleDateString("th-TH")} - ${season.endDate ? new Date(season.endDate).toLocaleDateString("th-TH") : "ปัจจุบัน"}`
    );
    doc.moveDown();

    let totalSum = 0;
    exports.forEach((exp, i) => {
      console.log(`🔍 export ID ${exp.id}`);

      let durianTotal = 0;
      try {
        const durians = Array.isArray(exp.durianItems) ? exp.durianItems : JSON.parse(exp.durianItems || "[]");
        durianTotal = durians.reduce((sum, d) => sum + (d.boxes * d.weightPerBox * d.pricePerKg), 0);
      } catch (e) {
        console.warn(`⚠️ durianItems format invalid for export ID ${exp.id}`);
      }

      let boxTotal = 0;
      try {
        const boxes = typeof exp.boxCosts === 'object' ? exp.boxCosts : JSON.parse(exp.boxCosts || '{}');
        boxTotal = Object.values(boxes).reduce((sum, b) => sum + (b.quantity * b.unitCost), 0);
      } catch (e) {
        console.warn(`⚠️ boxCosts format invalid for export ID ${exp.id}`);
      }

      let handleTotal = 0;
      try {
        const handlers = typeof exp.handlingCosts === 'object' ? exp.handlingCosts : JSON.parse(exp.handlingCosts || '{}');
        handleTotal = Object.values(handlers).reduce((sum, h) => sum + (h.weight * h.costPerKg), 0);
      } catch (e) {
        console.warn(`⚠️ handlingCosts format invalid for export ID ${exp.id}`);
      }

      let freightTotal = 0;
      try {
        const freights = Array.isArray(exp.freightItems) ? exp.freightItems : JSON.parse(exp.freightItems || "[]");
        freightTotal = freights.reduce((sum, f) => sum + (f.weight * f.pricePerKg), 0);
      } catch (e) {
        console.warn(`⚠️ freightItems format invalid for export ID ${exp.id}`);
      }

      const inspectionFee = Number(exp.inspectionFee) || 0;
      const total = durianTotal + boxTotal + handleTotal + freightTotal + inspectionFee;
      totalSum += total;

      try {
        doc.fontSize(12).text(
          `${i + 1}. วันที่: ${exp.date} | เมือง: ${exp.city} | รหัสตู้: ${exp.containerCode} | รวม: ${Number(total).toLocaleString()} บาท`
        );
      } catch (err) {
        console.warn(`⚠️ export ID ${exp.id} render failed`, err);
      }
    });

    doc.moveDown();
    doc.fontSize(16).text(`รวมยอดทั้งฤดูกาล: ${Number(totalSum).toLocaleString()} บาท`, { align: "right" });
    doc.end();
  } catch (err) {
    console.error("/summarypdf error::", util.inspect(err, { depth: null }));
    res.status(500).send("เกิดข้อผิดพลาดขณะสร้าง PDF");
  }
});


module.exports = router;

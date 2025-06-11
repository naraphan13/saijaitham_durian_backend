const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const prisma = require("../models/prisma");
const router = express.Router();











// POST เพิ่มข้อมูล
router.post('/', async (req, res) => {
  try {
    const data = await prisma.containerLoading.create({
      data: req.body,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ', details: err });
  }
});

// GET ดูทั้งหมด
router.get('/', async (req, res) => {
  try {
    const data = await prisma.containerLoading.findMany({
      orderBy: { date: 'desc' },
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ', details: err });
  }
});

// GET ดูทีละ id
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.containerLoading.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'ไม่พบข้อมูล', details: err });
  }
});

// PUT แก้ไข
router.put('/:id', async (req, res) => {
  try {
    const updated = await prisma.containerLoading.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'แก้ไขข้อมูลไม่สำเร็จ', details: err });
  }
});

// DELETE ลบ
router.delete('/:id', async (req, res) => {
  try {
    await prisma.containerLoading.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: 'ลบไม่สำเร็จ', details: err });
  }
});

// GET PDF
router.get("/:id/pdf", async (req, res) => {
  try {
    const data = await prisma.containerLoading.findUnique({
      where: { id: parseInt(req.params.id) },
    });

    if (!data) return res.status(404).send("ไม่พบข้อมูล");

    const doc = new PDFDocument({
      size: [396, 648],
      margin: 20,
      layout: "landscape",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=\"container-loading-${data.id}.pdf\"`);
    doc.pipe(res);

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const topY = 20;
    const logoX = 20;
    const logoY = topY + 10;
    const companyX = logoX + logoSize + 15;
    const billInfoX = companyX + 250;

    const date = new Date(data.date);
    const dateStr = new Intl.DateTimeFormat("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(date);
    const timeStr = new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok",
    }).format(date);

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.font("thai").fontSize(13).text("เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", companyX, topY + 18);
    doc.font("thai").fontSize(13).text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", companyX, topY + 36);

    doc.font("thai").fontSize(13).text(
      `รหัสบิล: ${data.id}    จ่ายให้: ${data.recipient || "__________"}`,
      billInfoX,
      topY
    );
    doc.font("thai").fontSize(13).text(`โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร   เพื่อชำระ: ค่าขึ้นตู้ทุเรียน`, billInfoX, topY + 18);
    doc.font("thai").fontSize(13).text(`วันที่: ${dateStr} `, billInfoX, topY + 36);

    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text("ใบสำคัญจ่าย PAYMENT VOUCHER", 0, doc.y, {
      align: "center",
      width: fullWidth,
    });

    doc.moveDown(1);
    doc.font("thai").fontSize(16).text("ใบสรุปค่าขึ้นตู้ทุเรียน", 20);
    doc.font("thai-bold").fontSize(16).text("รายละเอียดค่าขึ้นตู้:", 20);

    const containers = Array.isArray(data.containers) ? data.containers : [];
    let total = 0;
    containers.forEach((c, i) => {
      const label = c.label?.trim() || `ตู้ที่ ${i + 1}`;
      const price = c.price || 0;
      total += price;

      doc.font("thai").fontSize(16).text(`${label}: ${c.containerCode || "-"} × ${price.toLocaleString()} บาท`, 30);
    });

    doc.moveDown();
    doc.font("thai-bold").fontSize(18).text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, 20);

    const sigY = doc.page.height - 60;
    doc.fontSize(11).text("...............................................", 40, sigY);
    doc.text("ผู้จ่ายเงิน", 40, sigY + 12);
    doc.text("ลงวันที่: ........../........../..........", 40, sigY + 24);

    doc.text("...............................................", 340, sigY);
    doc.text("ผู้รับเงิน", 340, sigY + 12);
    doc.text("ลงวันที่: ........../........../..........", 340, sigY + 24);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "สร้าง PDF ไม่สำเร็จ", details: err });
  }
});

module.exports = router;

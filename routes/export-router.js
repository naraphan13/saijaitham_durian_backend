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
    'ใบส่งออกทุเรียน SURIYA 388 / Durian Export Invoice - SURIYA 388',
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
    const newExport = await prisma.exportContainer.create({
      data: req.body,
    });
    res.json(newExport);
  } catch (err) {
    console.error("❌ POST /v1/export error::", err);
    console.log('err', err)
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึก', details: err });
  }
});

// READ ALL: ดึงรายการเอกสารทั้งหมด
router.get('/', async (req, res) => {
  try {
    const exports = await prisma.exportContainer.findMany({
      orderBy: { date: 'desc' },
    });
    console.log(exports);
    res.json(exports);
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงรายการได้', details: err });
  }
});

// READ ONE: ดึงเอกสารตาม ID
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

// UPDATE: แก้ไขเอกสารตาม ID
router.put('/:id', async (req, res) => {
  try {
    const updated = await prisma.exportContainer.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
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

module.exports = router;

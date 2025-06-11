// 📁 routes/payroll-router.js
const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../models/prisma");

const router = express.Router();

// 🔸 GET รายการทั้งหมด
router.get("/", async (req, res) => {
  try {
    const data = await prisma.payroll.findMany({
      include: { deductions: true },
      orderBy: { date: "desc" },
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "โหลดข้อมูลไม่สำเร็จ" });
  }
});

// 🔸 GET รายการเดียว
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = await prisma.payroll.findUnique({
      where: { id },
      include: { deductions: true },
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "โหลดข้อมูลไม่สำเร็จ" });
  }
});

// 🔸 POST สร้างใหม่
router.post("/", async (req, res) => {
  try {
    const {
      name,
      date,
      payType,
      workDays,
      pricePerDay,
      monthlySalary,
      months,
      bonus,
      deductions = [],
    } = req.body;

    const basePay = payType === "รายวัน"
      ? parseFloat(workDays) * parseFloat(pricePerDay)
      : parseFloat(monthlySalary) * parseFloat(months || 1);

    const totalPay = basePay + parseFloat(bonus || 0);
    const totalDeduct = deductions.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
    const netPay = totalPay - totalDeduct;

    const payroll = await prisma.payroll.create({
      data: {
        employeeName: name,
        date: new Date(date),
        payType,
        workDays: workDays ? parseFloat(workDays) : null,
        pricePerDay: pricePerDay ? parseFloat(pricePerDay) : null,
        monthlySalary: monthlySalary ? parseFloat(monthlySalary) : null,
        months: months ? parseFloat(months) : null,
        bonus: parseFloat(bonus) || 0,
        totalPay,
        totalDeduct,
        netPay,
        deductions: {
          create: deductions.map(d => ({
            name: d.name,
            amount: parseFloat(d.amount),
          })),
        },
      },
    });

    res.json({ success: true, id: payroll.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "บันทึกไม่สำเร็จ" });
  }
});

// 🔸 PUT แก้ไข
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      name,
      date,
      payType,
      workDays,
      pricePerDay,
      monthlySalary,
      months,
      bonus,
      deductions = [],
    } = req.body;

    const basePay = payType === "รายวัน"
      ? parseFloat(workDays) * parseFloat(pricePerDay)
      : parseFloat(monthlySalary) * parseFloat(months || 1);

    const totalPay = basePay + parseFloat(bonus || 0);
    const totalDeduct = deductions.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
    const netPay = totalPay - totalDeduct;

    await prisma.deduction.deleteMany({ where: { payrollId: id } });

    const updated = await prisma.payroll.update({
      where: { id },
      data: {
        employeeName: name,
        date: new Date(date),
        payType,
        workDays: workDays ? parseFloat(workDays) : null,
        pricePerDay: pricePerDay ? parseFloat(pricePerDay) : null,
        monthlySalary: monthlySalary ? parseFloat(monthlySalary) : null,
        months: months ? parseFloat(months) : null,
        bonus: parseFloat(bonus) || 0,
        totalPay,
        totalDeduct,
        netPay,
        deductions: {
          create: deductions.map(d => ({
            name: d.name,
            amount: parseFloat(d.amount),
          })),
        },
      },
    });

    res.json({ success: true, id: updated.id });
  } catch (err) {
    console.log("err", err);
    res.status(500).json({ error: "แก้ไขไม่สำเร็จ" });
  }
});

// 🔸 DELETE
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.deduction.deleteMany({ where: { payrollId: id } });
    await prisma.payroll.delete({ where: { id } });
    res.json({ message: "ลบสำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: "ลบไม่สำเร็จ" });
  }
});

router.get("/:id/pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = await prisma.payroll.findUnique({
      where: { id },
      include: { deductions: true },
    });

    if (!data) return res.status(404).json({ error: "ไม่พบข้อมูล" });

    const doc = new PDFDocument({
      size: [396, 648], // A5 แนวนอน
      margin: 20,
      layout: "landscape",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=payroll-${data.id}.pdf`);
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

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoY, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.font("thai").fontSize(13).text(
      "เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190",
      companyX,
      topY + 18
    );
    doc.font("thai").fontSize(13).text(
      "โทร: 081-078-2324 , 082-801-1225 , 095-905-5588",
      companyX,
      topY + 36
    );

    doc.font("thai").fontSize(13).text(
      `รหัสบิล: ${data.id}    จ่ายให้: ${data.employeeName}`,
      billInfoX,
      topY
    );
    doc.font("thai").fontSize(13).text(
      `โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร   เพื่อชำระ: ค่าจ้างพนักงาน`,
      billInfoX,
      topY + 18
    );
    doc.font("thai").fontSize(13).text(
      `วันที่: ${dateStr} `,
      billInfoX,
      topY + 36
    );

    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      doc.y,
      { align: "center", width: doc.page.width }
    );

    doc.moveDown(0.3);
    doc.font("thai").fontSize(16).text("ใบสรุปเงินเดือนพนักงาน", 20);
    doc.font("thai-bold").fontSize(16).text("รายละเอียดค่าจ้าง:", 20);

    // ✅ คำนวณค่าจ้างพื้นฐาน + โบนัส
    const basePay =
      data.payType === "รายวัน" || data.payType === "รายตู้"
        ? (data.workDays || 0) * (data.pricePerDay || 0)
        : (data.monthlySalary || 0) * (data.months || 0);
    const bonus = data.bonus || 0;
    const totalPay = basePay + bonus;

    if (data.payType === "รายวัน") {
      doc.font("thai").fontSize(16).text(
        `รายวัน: ${data.workDays} วัน × ${data.pricePerDay} บาท = ${basePay.toLocaleString()} บาท`,
        20
      );
    } else if (data.payType === "รายเดือน") {
      doc.font("thai").fontSize(16).text(
        `รายเดือน: ${data.monthlySalary} บาท × ${data.months} เดือน = ${basePay.toLocaleString()} บาท`,
        20
      );
    } else if (data.payType === "รายตู้") {
      doc.font("thai").fontSize(16).text(
        `รายตู้: ${data.workDays} ตู้ × ${data.pricePerDay} บาท/ตู้ = ${basePay.toLocaleString()} บาท`,
        20
      );
    }

    // ✅ แสดงโบนัสถ้ามี
    if (bonus > 0) {
      doc.font("thai").fontSize(16).text(`พิเศษ: ${bonus.toLocaleString()} บาท`, 20);
    }

    // ✅ รายการหัก
    let totalDeduction = 0;
    if (Array.isArray(data.deductions) && data.deductions.length > 0) {
      doc.moveDown(0.2);
      doc.font("thai-bold").fontSize(16).text("รายละเอียดรายการหัก:", 20);
      data.deductions.forEach((d, idx) => {
        totalDeduction += d.amount || 0;
        doc.font("thai").fontSize(16).text(`${idx + 1}. ${d.name || "-"}: ${d.amount.toLocaleString()} บาท`, 30);
      });
    }

    const finalTotal = totalPay - totalDeduction;
    doc.moveDown(0.3);
    doc.font("thai-bold").fontSize(16).text(`รวมทั้งหมด: ${totalPay.toLocaleString()} บาท`, 20);
    if (totalDeduction > 0) {
      doc.font("thai-bold").fontSize(16).text(`หักเบิก: ${totalDeduction.toLocaleString()} บาท`, 20);
      doc.font("thai-bold").fontSize(16).text(`คงเหลือหลังหัก: ${finalTotal.toLocaleString()} บาท`, 20);
    }

    const signatureBaseY = doc.page.height - 60;
    doc.fontSize(11).text("...............................................", 40, signatureBaseY);
    doc.fontSize(11).text("ผู้จ่ายเงิน", 40, signatureBaseY + 12);
    doc.fontSize(11).text("ลงวันที่: ........../........../..........", 40, signatureBaseY + 24);

    doc.fontSize(11).text("...............................................", 340, signatureBaseY);
    doc.fontSize(11).text("ผู้รับเงิน", 340, signatureBaseY + 12);
    doc.fontSize(11).text("ลงวันที่: ........../........../..........", 340, signatureBaseY + 24);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้าง PDF", details: err });
  }
});


module.exports = router;
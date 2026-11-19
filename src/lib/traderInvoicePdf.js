import jsPDF from 'jspdf';

async function loadImageAsDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateTraderInvoicePdf(invoice, profile, { download = true } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const currency = profile?.currency || 'KES';
  const isReceipt = invoice?.doc_type === 'receipt' || invoice?.status === 'paid';
  const docTitle = invoice?.doc_type === 'receipt' ? 'PAYMENT RECEIPT' : 'INVOICE';

  let y = 44;

  // Optional Business Logo
  if (profile?.logo_url) {
    const dataUrl = await loadImageAsDataUrl(profile.logo_url);
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, 'PNG', 40, y, 52, 52);
      } catch {
        // Ignore unsupported image formats silently
      }
    }
  }

  const headerX = profile?.logo_url ? 104 : 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(profile?.business_name || 'Supplier Business', headerX, y + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  let metaY = y + 32;
  if (profile?.location) {
    doc.text(String(profile.location), headerX, metaY);
    metaY += 13;
  }
  if (profile?.kra_pin) {
    doc.text(`KRA PIN: ${profile.kra_pin}`, headerX, metaY);
    metaY += 13;
  }
  const contactLine = [profile?.phone, profile?.email].filter(Boolean).join(' · ');
  if (contactLine) {
    doc.text(contactLine, headerX, metaY);
    metaY += 13;
  }

  // Right-side Document Badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(docTitle, pageWidth - 40, y + 16, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(180, 83, 9);
  doc.text(`#${invoice?.invoice_number || 'INV-0001'}`, pageWidth - 40, y + 33, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Issue Date: ${invoice?.issue_date || ''}`, pageWidth - 40, y + 48, { align: 'right' });
  if (invoice?.due_date) {
    doc.text(`Due Date: ${invoice.due_date}`, pageWidth - 40, y + 61, { align: 'right' });
  }

  // PAID Stamp
  if (isReceipt && invoice?.status === 'paid') {
    doc.setDrawColor(16, 185, 129);
    doc.setLineWidth(2);
    doc.roundedRect(pageWidth - 135, y + 70, 95, 28, 4, 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(5, 150, 105);
    doc.text('PAID', pageWidth - 87.5, y + 89, { align: 'center' });
  }

  y = Math.max(metaY, y + 95) + 18;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(40, y, pageWidth - 40, y);
  y += 18;

  // Bill To
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('BILL TO', 40, y);
  y += 14;
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice?.buyer_name || 'Customer', 40, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const buyerMeta = [invoice?.buyer_phone, invoice?.buyer_email].filter(Boolean).join(' · ');
  if (buyerMeta) {
    doc.text(buyerMeta, 40, y);
    y += 14;
  }

  y += 12;

  // Table Header
  doc.setFillColor(248, 250, 252);
  doc.rect(40, y, pageWidth - 80, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('ITEM', 48, y + 16);
  doc.text('QTY / UNIT', 310, y + 16, { align: 'right' });
  doc.text('PRICE', 415, y + 16, { align: 'right' });
  doc.text('AMOUNT', pageWidth - 48, y + 16, { align: 'right' });
  y += 32;

  // Items
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const item of items) {
    if (y > 720) {
      doc.addPage();
      y = 48;
    }
    const qty = Number(item.quantity || 1);
    const unit = item.unit ? ` ${item.unit}` : '';
    const unitPrice = Number(item.unit_price ?? item.price ?? 0);
    const lineAmt = qty * unitPrice;

    doc.setTextColor(15, 23, 42);
    doc.text(String(item.name || 'Item').slice(0, 48), 48, y);
    doc.setTextColor(71, 85, 105);
    doc.text(`${qty}${unit}`, 310, y, { align: 'right' });
    doc.text(`${currency} ${unitPrice.toLocaleString()}`, 415, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`${currency} ${lineAmt.toLocaleString()}`, pageWidth - 48, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 20;
    doc.setDrawColor(241, 245, 249);
    doc.line(40, y - 6, pageWidth - 40, y - 6);
  }

  y += 12;
  const subtotal = Number(invoice?.subtotal || 0);
  const tax = Number(invoice?.tax_amount || 0);
  const total = Number(invoice?.total_amount || 0);
  const paid = Number(invoice?.amount_paid || 0);
  const balance = Math.max(0, total - paid);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal:', pageWidth - 165, y);
  doc.text(`${currency} ${subtotal.toLocaleString()}`, pageWidth - 48, y, { align: 'right' });
  y += 16;

  if (tax > 0) {
    doc.text('VAT (16%):', pageWidth - 165, y);
    doc.text(`${currency} ${tax.toLocaleString()}`, pageWidth - 48, y, { align: 'right' });
    y += 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Total:', pageWidth - 165, y);
  doc.text(`${currency} ${total.toLocaleString()}`, pageWidth - 48, y, { align: 'right' });
  y += 18;

  if (paid > 0) {
    doc.setFontSize(10);
    doc.setTextColor(5, 150, 105);
    doc.text('Amount Paid:', pageWidth - 165, y);
    doc.text(`${currency} ${paid.toLocaleString()}`, pageWidth - 48, y, { align: 'right' });
    y += 15;
    doc.setTextColor(180, 83, 9);
    doc.text('Balance Due:', pageWidth - 165, y);
    doc.text(`${currency} ${balance.toLocaleString()}`, pageWidth - 48, y, { align: 'right' });
    y += 18;
  }

  // Payment Methods Box (M-Pesa Till No, M-Pesa Paybill, Cash, Cheque)
  y += 14;
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(40, y, pageWidth - 80, 82, 8, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(146, 64, 14);
  doc.text('PAYMENT OPTIONS', 52, y + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  let py = y + 34;
  const optLines = [];
  if (profile?.mpesa_till_no) optLines.push(`• M-Pesa Till No: ${profile.mpesa_till_no}`);
  if (profile?.mpesa_paybill_no) {
    optLines.push(`• M-Pesa Paybill: ${profile.mpesa_paybill_no}${profile.mpesa_account_no ? ` (Account: ${profile.mpesa_account_no})` : ''}`);
  }
  if (profile?.send_money_number) {
    optLines.push(`• Send Money (${profile.send_money_provider || 'M-Pesa'}): ${profile.send_money_number}`);
  }
  const otherAccepted = [
    profile?.accepts_cash !== false ? 'Cash' : null,
    profile?.accepts_cheque !== false ? 'Cheque' : null,
  ].filter(Boolean);
  if (otherAccepted.length > 0) optLines.push(`• Also Accepted: ${otherAccepted.join(' / ')}`);
  if (invoice?.payment_method) {
    optLines.push(`• Preferred / Paid Via: ${invoice.payment_method}${invoice.payment_reference ? ` (Ref: ${invoice.payment_reference})` : ''}`);
  }
  for (const line of optLines.slice(0, 4)) {
    doc.text(line, 52, py);
    py += 13;
  }

  if (invoice?.notes) {
    y += 100;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('NOTES', 40, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(String(invoice.notes).slice(0, 220), 40, y + 14);
  }

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Generated with ManiPOS Invoices · manipos.com/#/invoices', pageWidth / 2, 810, { align: 'center' });

  if (download) {
    doc.save(`${invoice?.invoice_number || 'invoice'}.pdf`);
  }
  return doc;
}

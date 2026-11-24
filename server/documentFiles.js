// Files derived from stored text use its existing passage positions, including in saved chats.
const linesPerPage = 30;
function layout(body) {
  const pages = [[]], locations = {};
  (body.match(/[^\n]{1,1200}/g) || []).forEach((paragraph,index) => {
    if (/^\[Seite \d+\]$/.test(paragraph.trim())) return;
    const lines = [];
    let remaining = paragraph.trim();
    while (remaining.length) {
      let length = Math.min(78,remaining.length);
      if (length < remaining.length) {
        const space = remaining.lastIndexOf(' ', length);
        if (space > 0) length = space;
        if (/^[\uDC00-\uDFFF]$/.test(remaining[length])) length--;
      }
      lines.push(remaining.slice(0,length));
      remaining = remaining.slice(length).trimStart();
    }
    if (!lines.length) return;
    let page = pages.at(-1);
    if (page.length && page.length + 1 + Math.min(lines.length,linesPerPage) > linesPerPage) {
      page = []; pages.push(page);
    }
    if (page.length) page.push(null);
    locations[index + 1] = pages.length;
    for (const [n,text] of lines.entries()) {
      if (page.length === linesPerPage) { page = []; pages.push(page); }
      page.push({text, position:n === 0 ? index + 1 : null});
    }
  });
  return {pages,locations};
}

export function fileLocations(doc) {
  return doc.format === 'PDF' ? layout(doc.body).locations : {};
}

const numberWithUnit = /(?<![\d.,])(-?\d+(?:\.\d{3})*(?:,\d+)?)\s*(Millionen\s+EUR|Mio\.\s*EUR|Tausend\s+EUR|TEUR|EUR|Euro|€|Prozent|%)(?!\p{L})/giu;

async function workbook(doc) {
  const XLSX = await import('xlsx');
  const rows = [[doc.name.replace(/\.txt$/i,'')],[doc.issuer || ''],[],['Absatz','Belegtext','Wert','Einheit']];
  for (const [i,text] of (doc.body.match(/[^\n]{1,1200}/g) || []).entries()) {
    if (/^\[Seite \d+\]$/.test(text.trim())) continue;
    const values = [...text.matchAll(numberWithUnit)];
    const row = [i + 1,text];
    if (values.length === 1) {
      row.push(Number(values[0][1].replaceAll('.','').replace(',','.')), values[0][2]);
    }
    rows.push(row);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{wch:9},{wch:102},{wch:19},{wch:18}];
  sheet['!autofilter'] = {ref:'A4:D' + rows.length};
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,sheet,'Nachweis');
  const sourceLines = doc.body.split(/\r?\n/).filter(line => line.trim() && !/^\[Seite \d+\]$/.test(line.trim()));
  const separator = ['\t',';',','].find(mark => sourceLines.length >= 2 && sourceLines.every(line => line.includes(mark)));
  if (separator && (/\.csv$/i.test(doc.name) || separator === '\t')) {
    const data = XLSX.read(sourceLines.join('\n'),{type:'string',raw:true,FS:separator});
    const cells = XLSX.utils.sheet_to_json(data.Sheets[data.SheetNames[0]],{header:1,raw:false});
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(cells),'Tabellendaten');
  }
  return XLSX.write(book,{bookType:'xlsx',type:'buffer',compression:true});
}

async function pdfFile(doc) {
  const {default:PDFDocument} = await import('pdfkit');
  const {createRequire} = await import('node:module');
  const require = createRequire(import.meta.url);
  const regular = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
  const bold = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');
  const pdf = new PDFDocument({font:regular,size:'A4',autoFirstPage:false,margin:0,info:{Title:doc.name,Author:doc.issuer || '',CreationDate:new Date(doc.created || 0)}});
  const chunks = [];
  const result = new Promise((resolve,reject) => {
    pdf.on('data',buf => chunks.push(buf)); pdf.on('error',reject);
    pdf.on('end',() => resolve(Buffer.concat(chunks)));
  });
  const {pages} = layout(doc.body);
  const metrics = [];
  if (/monatsbericht/i.test(doc.name) && /beträge in EUR/i.test(doc.body)) {
    for (const match of doc.body.matchAll(/\b(Umsatz|EBITDA|EBIT)\s+(-?\d+)(?=\s*[;.])/g)) {
      if (!metrics.some(m => m[0] === match[1])) metrics.push([match[1],Number(match[2])]);
    }
  }
  function line(text,x,y,width,size,font,color) {
    pdf.font(font).fontSize(size).fillColor(color);
    const measured = pdf.widthOfString(text);
    if (measured > width) pdf.fontSize(size * width / measured);
    pdf.text(text,x,y,{lineBreak:false});
  }
  pages.forEach((rows,index) => {
    pdf.addPage();
    const ink = '#18253e', muted = '#556477';
    line(doc.issuer || 'Dokumentation',44,40,500,10,regular,muted);
    line(doc.name.replace(/\.(txt|md)$/i,''),44,69,506,21,bold,ink);
    pdf.rect(44,108,506,2).fill('#406776');
    const showMetrics = index === 0 && metrics.length > 0;
    if (showMetrics) metrics.forEach(([label,value],i) => {
      const x = 44 + i * 171;
      pdf.rect(x,123,160,50).fill('#eef3f5');
      line(label,x+10,130,140,8,regular,muted);
      line(value.toLocaleString('de-DE') + ' EUR',x+10,147,141,14,bold,ink);
    });
    rows.forEach((row,n) => {
      if (!row) return;
      const y = (showMetrics ? 196 : 135) + 18 * n;
      if (row.position) line(String(row.position),44,y+1,23,8,regular,muted);
      line(row.text,73,y,477,10,regular,ink);
    });
    pdf.moveTo(44,782).lineTo(550,782).strokeColor('#dce3e9').stroke();
    line(doc.excerpt ? 'Freigegebener Auszug' : doc.exercise ? 'Unternehmensfall · Übungsdaten' : 'Dokumentation',44,794,340,9,regular,muted);
    line('Seite ' + (index+1) + ' / ' + pages.length,460,794,94,9,regular,muted);
  });
  pdf.end();
  return result;
}

export async function renderFile(doc) {
  return doc.format === 'XLSX' ? workbook(doc) : pdfFile(doc);
}

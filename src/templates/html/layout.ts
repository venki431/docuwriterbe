interface LayoutOptions {
  title: string;
  body: string;
}

export function wrapHtml({ title, body }: LayoutOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 20mm 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      color: #111;
      font-size: 12pt;
      line-height: 1.65;
      margin: 0;
      position: relative;
    }
    h1.doc-title {
      text-align: center;
      font-size: 18pt;
      letter-spacing: 2px;
      margin: 0 0 8px;
      text-transform: uppercase;
    }
    h2.doc-subtitle {
      text-align: center;
      font-size: 12pt;
      font-weight: normal;
      margin: 0 0 24px;
      color: #444;
    }
    p { margin: 0 0 12px; text-align: justify; }
    .section { margin-bottom: 14px; }
    .label { font-weight: bold; }
    table.boundaries {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 18px;
    }
    table.boundaries td {
      border: 1px solid #333;
      padding: 6px 10px;
      vertical-align: top;
    }
    .signature-block {
      margin-top: 60px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 45%;
      text-align: center;
      border-top: 1px solid #333;
      padding-top: 6px;
    }
    .witness-block {
      margin-top: 40px;
    }
    .witness-box {
      margin-top: 20px;
      border-top: 1px solid #777;
      padding-top: 4px;
      width: 60%;
    }
    .verification {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px dashed #999;
    }
    .content { position: relative; z-index: 1; }
  </style>
</head>
<body>
  <div class="content">
    ${body}
  </div>
</body>
</html>`;
}

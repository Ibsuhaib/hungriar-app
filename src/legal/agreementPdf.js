// Opens a print window rendering a signed agreement record as a clean A4
// document — the browser's "Save as PDF" is the download path, same pattern
// as the existing bill / day-end printing.
//
// Renders ONLY from the stored `signed_agreements` row (immutable snapshot),
// never from the live agreement text, so the document always shows exactly
// what was signed.

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function openAgreementPdf({ record, restaurantName }) {
  // The signature is a PNG data URL drawn by the signer. Validate the prefix
  // so a corrupted value can't inject anything into the src attribute.
  const sig = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(record.signature_data_url)
    ? record.signature_data_url
    : ''

  const signedAt = new Date(record.signed_at).toLocaleString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  // The stored snapshot is plain text: title block, then "N. Heading\nbody…"
  // paragraphs separated by blank lines. Render each block as a paragraph;
  // numbered headings get bold styling.
  const blocks = record.agreement_text
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((l) => escapeHtml(l.trim())).filter(Boolean)
      if (lines.length === 0) return ''
      if (/^\d+\.\s/.test(lines[0])) {
        const [heading, ...rest] = lines
        return `<h2>${heading}</h2>${rest.map((p) => `<p>${p}</p>`).join('')}`
      }
      return lines.map((p) => `<p>${p}</p>`).join('')
    })
    .join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>HungriAR Agreement — ${escapeHtml(restaurantName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; padding: 48px 56px; max-width: 800px; margin: 0 auto; line-height: 1.55; font-size: 13px; }
    .brand { font-family: Arial, sans-serif; font-weight: bold; font-size: 20px; letter-spacing: -0.5px; }
    .brand span { color: #b8865a; }
    .meta { font-family: Arial, sans-serif; color: #666; font-size: 11px; margin-top: 4px; }
    .rule { border: none; border-top: 2px solid #111; margin: 18px 0 22px; }
    h2 { font-family: Arial, sans-serif; font-size: 13px; margin: 18px 0 6px; }
    p { margin: 6px 0; text-align: justify; }
    .sign-block { margin-top: 40px; padding-top: 18px; border-top: 1px solid #999; display: flex; justify-content: space-between; gap: 40px; page-break-inside: avoid; }
    .sign-col { flex: 1; font-family: Arial, sans-serif; font-size: 12px; }
    .sign-col .label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
    .sig-img { height: 70px; margin: 4px 0; display: block; }
    .sig-line { border-top: 1px solid #333; padding-top: 6px; margin-top: 6px; }
    .footer { margin-top: 36px; font-family: Arial, sans-serif; font-size: 10px; color: #999; text-align: center; }
    .no-print { font-family: Arial, sans-serif; text-align: center; margin-bottom: 24px; }
    .no-print button { padding: 10px 22px; font-size: 14px; font-weight: bold; cursor: pointer; border: none; border-radius: 8px; background: #0f172a; color: #fff; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">Print / Save as PDF</button></div>

  <div class="brand">hungri<span>AR</span></div>
  <p class="meta">Subscription &amp; Service Agreement · Version ${escapeHtml(record.agreement_version)} · Signed ${escapeHtml(signedAt)}</p>
  <hr class="rule" />

  ${blocks}

  <div class="sign-block">
    <div class="sign-col">
      <p class="label">Signed for the Restaurant</p>
      ${sig ? `<img class="sig-img" src="${sig}" alt="Signature" />` : '<p style="height:70px"></p>'}
      <div class="sig-line">
        <strong>${escapeHtml(record.signer_name)}</strong><br />
        ${escapeHtml(restaurantName)}<br />
        ${escapeHtml(signedAt)}
      </div>
    </div>
    <div class="sign-col">
      <p class="label">Accepted by</p>
      <p style="height:70px; display:flex; align-items:flex-end; font-weight:bold;">HungriAR</p>
      <div class="sig-line">
        Mangalore, Karnataka, India<br />
        hungriar.app@gmail.com
      </div>
    </div>
  </div>

  <p class="footer">Electronically signed and recorded by the HungriAR platform · Record ID ${escapeHtml(record.id)}</p>
</body>
</html>`

  const win = window.open('', '_blank', 'width=860,height=900')
  if (!win) return false
  win.document.write(html)
  win.document.close()
  win.focus()
  return true
}

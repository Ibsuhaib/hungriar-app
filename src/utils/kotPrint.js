/**
 * Prints a KOT (Kitchen Order Ticket) for a given order.
 * Opens a small popup, formats for 80mm thermal paper, triggers print.
 */
export function printKOT(order, restaurantName = 'Restaurant') {
  const items   = (order.order_items || []).filter((i) => !i.cancelled)
  const tableNo = order.tables?.table_number ?? '?'
  const kotId   = order.id.slice(-6).toUpperCase()
  const time    = new Date(order.order_time).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const date    = new Date(order.order_time).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  const itemRows = items.map((item) => {
    const note = item.notes ? `<div class="note">&gt; ${item.notes}</div>` : ''
    return `
      <tr>
        <td class="qty">${item.quantity}</td>
        <td class="item">${item.item_name}${note}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>KOT #${kotId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      width: 80mm;
      padding: 6mm 4mm;
      color: #000;
      background: #fff;
    }
    .center  { text-align: center; }
    .bold    { font-weight: 700; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .solid   { border-top: 2px solid #000; margin: 6px 0; }
    .header  { font-size: 16px; font-weight: 700; text-align: center; margin-bottom: 2px; }
    .sub     { font-size: 11px; text-align: center; margin-bottom: 6px; }
    .meta    { display: flex; justify-content: space-between; font-size: 12px; margin: 3px 0; }
    table    { width: 100%; border-collapse: collapse; }
    .qty     { width: 28px; font-weight: 700; vertical-align: top; padding: 3px 4px 3px 0; font-size: 14px; }
    .item    { padding: 3px 0; vertical-align: top; font-size: 13px; line-height: 1.4; }
    .note    { font-size: 11px; color: #333; margin-top: 1px; font-style: italic; }
    .kot-id  { text-align: center; font-size: 11px; margin-top: 8px; color: #444; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body  { padding: 3mm 4mm; }
    }
  </style>
</head>
<body>
  <p class="header">KOT</p>
  <p class="sub">${restaurantName}</p>
  <div class="solid"></div>

  <div class="meta"><span class="bold">Table</span><span class="bold">${tableNo}</span></div>
  <div class="meta"><span>Date</span><span>${date}</span></div>
  <div class="meta"><span>Time</span><span>${time}</span></div>

  <div class="solid"></div>
  <div class="meta bold"><span>QTY</span><span>ITEM</span></div>
  <div class="divider"></div>

  <table>${itemRows}</table>

  <div class="solid"></div>
  <p class="kot-id">KOT # ${kotId}</p>
</body>
</html>`

  const w = window.open('', '_blank', 'width=320,height=520,scrollbars=no')
  if (!w) { alert('Allow pop-ups to print KOT'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 300)
}

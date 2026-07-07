// KOT and customer receipt printing for 80mm thermal printers.
// Renders a print-only document in a hidden iframe and calls print().

import { rupees, shortId, formatDateTime } from './format.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

const BASE_CSS = `
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 4mm 0; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .lg { font-size: 15px; }
  .xl { font-size: 18px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  td.qty { width: 26px; }
  td.amt { text-align: right; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; }
`;

function printHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '100%';
  iframe.style.bottom = '100%';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 2000);
}

export function printKot(order) {
  const items = (order.order_items ?? [])
    .map((i) => `<tr><td class="qty bold">${i.quantity}×</td><td>${esc(i.item_name)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    <p class="center bold xl">KOT</p>
    <p class="center bold lg">${order.order_type === 'takeaway' ? 'TAKEAWAY' : 'DELIVERY'}</p>
    <hr>
    <div class="row"><span>#${shortId(order.id)}</span><span>${formatDateTime(order.created_at)}</span></div>
    ${order.customer_name ? `<p>Customer: ${esc(order.customer_name)}</p>` : ''}
    <hr>
    <table>${items}</table>
    ${order.notes ? `<hr><p class="bold">NOTE: ${esc(order.notes)}</p>` : ''}
    <hr>
    <p class="center">hungriOrder</p>
  </body></html>`;
  printHtml(html);
}

export function printReceipt(order, restaurant) {
  const items = (order.order_items ?? [])
    .map(
      (i) =>
        `<tr><td class="qty">${i.quantity}×</td><td>${esc(i.item_name)}</td><td class="amt">${rupees(i.quantity * i.unit_price)}</td></tr>`
    )
    .join('');
  const addr = order.delivery_address;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    <p class="center bold xl">${esc(restaurant?.name ?? 'Receipt')}</p>
    ${restaurant?.address ? `<p class="center">${esc(restaurant.address)}</p>` : ''}
    ${restaurant?.phone ? `<p class="center">Ph: ${esc(restaurant.phone)}</p>` : ''}
    <hr>
    <div class="row"><span>#${shortId(order.id)}</span><span>${formatDateTime(order.created_at)}</span></div>
    <p>${order.order_type === 'takeaway' ? 'Takeaway' : 'Delivery'} · ${esc(order.payment_method ?? 'cash').toUpperCase()}</p>
    ${order.customer_name ? `<p>Customer: ${esc(order.customer_name)}</p>` : ''}
    <p>Phone: ${esc(order.customer_phone)}</p>
    ${addr ? `<p>Addr: ${esc([addr.line1, addr.line2, addr.city, addr.pincode].filter(Boolean).join(', '))}</p>` : ''}
    <hr>
    <table>${items}</table>
    <hr>
    <div class="row"><span>Subtotal (incl. taxes)</span><span>${rupees(Number(order.total_amount) - (Number(order.delivery_fee) || 0))}</span></div>
    ${Number(order.delivery_fee) > 0 ? `<div class="row"><span>Delivery fee</span><span>${rupees(order.delivery_fee)}</span></div>` : ''}
    <div class="row bold lg"><span>TOTAL</span><span>${rupees(order.total_amount)}</span></div>
    ${order.notes ? `<hr><p>Note: ${esc(order.notes)}</p>` : ''}
    <hr>
    <p class="center">Thank you! Order again at</p>
    <p class="center bold">hungriorder.com/r/${esc(restaurant?.slug ?? '')}</p>
  </body></html>`;
  printHtml(html);
}

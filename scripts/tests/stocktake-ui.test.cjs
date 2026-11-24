const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixture, text } = require('./helpers/ui-fixture.cjs');

const water = '00000000-0000-4000-8000-000000000001';
const tea = '00000000-0000-4000-8000-000000000002';
const coffee = '00000000-0000-4000-8000-000000000003';
const items = [
  { id: water, name: '水2L', stock: 16, is_available: true },
  { id: tea, name: '緑茶2L', stock: 21, is_available: true },
  { id: coffee, name: 'コーヒー', stock: 3, is_available: false },
];
const inventory = 'app/admin/stock/InventoryClient.tsx';
const output = (h, name) => text(h.all().find(node => node.type === 'output' && node.props['aria-label'] === name));

test('one stocktake takes one sales-unit count per product including zero and calculates each difference', async () => {
  const h = fixture(inventory, { items });
  h.change('水2Lの実数', '０');
  h.change('緑茶2Lの実数', '１９');
  assert.equal(output(h, '緑茶2Lの差'), '−2');
  assert.equal(output(h, '水2Lの差'), '−16');
  assert.equal(output(h, 'コーヒーの差'), '—');
  assert.equal(h.all().filter(node => node.props['data-count-field']).length, items.length);
  h.change('商品名で検索', '緑茶');
  await h.click('棚卸内容を確認');
  assert.ok(text(h.render()).includes('21 → 19'));
  assert.ok(text(h.render()).includes('16 → 0'));
  h.change('棚卸メモ（任意）', '二つの保管場所を確認');
  assert.equal(h.calls.length, 0);
  h.setResponder(async () => ({ ok: false, status: 500, json: async () => ({ error: '未確認' }) }));
  await h.click('棚卸を記録する');
  assert.equal(h.calls[0].url, '/api/admin/stocktakes');
  assert.deepEqual(h.calls[0].body.entries, [
    { item_id: water, expected_stock: 16, actual_count: 0 },
    { item_id: tea, expected_stock: 21, actual_count: 19 },
  ]);
  assert.equal(h.button('入力に戻る').props.disabled, true);
  h.setResponder(async ({ body }) => ({
    ok: true, status: 200, json: async () => ({
      ok: true, request_id: body.request_id, note: body.note, created_at: '2026-11-24T09:00:00Z',
      actor_name: '記録者', item_count: 2, changed_count: 2,
      entries: body.entries.map((entry, i) => ({
        item_id: entry.item_id, item_name: items[i].name, stock_before: entry.expected_stock, stock_after: entry.actual_count,
      })),
    }),
  }));
  await h.click('同じ内容で再試行');
  assert.deepEqual(h.calls[1].body, h.calls[0].body);
  assert.ok(text(h.render()).includes('棚卸を記録しました'));
  assert.equal(h.refreshes(), 1);
});

test('an invalid count or refreshed stock cannot change the counted target silently', async () => {
  const props = { items };
  const h = fixture(inventory, props);
  h.change('緑茶2Lの実数', '2.5');
  await h.click('棚卸内容を確認');
  assert.ok(text(h.render()).includes('緑茶2Lの実数は0以上の整数'));
  h.change('緑茶2Lの実数', '19');
  props.items = items.map(item => item.id === tea ? { ...item, stock: 20 } : item);
  await h.click('棚卸内容を確認');
  assert.equal(h.field('緑茶2Lの実数').props.disabled, true);
  assert.ok(text(h.render()).includes('在庫が変わりました'));
  await h.click('この商品を数え直す');
  assert.equal(h.field('緑茶2Lの実数').props.value, '');
  assert.equal(h.calls.length, 0);
});

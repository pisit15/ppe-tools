#!/usr/bin/env python3
"""Quotation register helper for D:\\Odoo PR (quotes_extracted.json). Standard library only.

  python3 quote_tools.py candidates <tree.json> <quotes_extracted.json> <out.json>
      Attachments that look like quotations / price comparisons and are not in the register yet.
  python3 quote_tools.py merge <quotes_extracted.json> <extract.json> <out.json> [--basis basis.json] [--hashes quote_hashes.json]
      Appends what was read (extract.json, see below) to the register: new quote ids after the current maximum,
      items appended at the end (item ids are positions, so existing ids never move). Identical copies of a file in
      other PRs get the same quotes flagged duplicate_file. --basis sets price_basis on existing quotes
      ({"<quote_id>": "month"|"year"|"once"|null}). --hashes updates a {sha256: path} index of read files.
  python3 quote_tools.py validate <quotes_extracted.json>
      Consistency report (ids, item counts, totals, price basis). Exit code 1 on errors.

extract.json = {"docs": [...], "files": [...], "quotes": [...], "items": [...], "known_copies": [...], "records": {...}}
  known_copies: {"file": new path, "same_as": path already in the register} for byte-identical new attachments.
  docs:    {"doc_id", "file", "member": null|"name inside a zip", "copies": [paths of identical files], "sha256"}
  files/quotes/items: the reading results keyed by doc_id (and "q" = quote number within the doc), as in the
           reading brief: files {doc_id, doc_type, readable, n_quotes, same_as, remark}; quotes {doc_id, q, vendor,
           vendor_group, quote_no, date, customer, currency, subtotal, discount, vat, total, price_basis, notes, n_items};
           items {doc_id, q, name, spec, qty, unit, unit_price, amount}.
  records: optional {"files", "quotes", "items"} already in register shape (one entry per PR), where quotes and items
           are linked by "_k" instead of quote_id. Used when one workbook gives each PR different numbers.
Paths are relative to D:\\Odoo PR with backslashes: "<person>\\<PR>\\<file>".
"""
import json, re, sys, copy

KW = re.compile(r'ใบเสนอ|เสนอราคา|quotation|quote|qt[\s._-]?\d|เปรียบเทียบ|compare|qo\d|ราคา', re.I)
EXT = re.compile(r'\.(pdf|xlsx|xls|jpg|jpeg|png|zip)$', re.I)
BASES = ('month', 'year', 'once')
CHECK = 'จำนวน×ราคา ≠ ยอด (ตามที่พิมพ์)'
QUOTE_KEYS = ['quote_id', 'file', 'person', 'pr', 'doc_type', 'vendor', 'quote_no', 'date', 'customer', 'currency', 'subtotal',
              'discount', 'vat', 'total', 'notes', 'n_items', 'duplicate_file', 'vendor_group', 'price_basis']
ITEM_KEYS = ['quote_id', 'pr', 'person', 'vendor', 'date', 'quote_no', 'name', 'spec', 'qty', 'unit', 'unit_price', 'amount',
             'duplicate_file', 'file', 'vendor_group', 'check']


def load(p):
    with open(p, encoding='utf-8-sig') as f:
        return json.load(f)


def save(p, data):
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def split(path):
    parts = path.split('\\')
    return parts[0], parts[1]


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def check_note(it):
    q, p, a = num(it.get('qty')), num(it.get('unit_price')), num(it.get('amount'))
    if q is None or p is None or a is None:
        return ''
    return CHECK if abs(q * p - a) > max(1.0, abs(a) * 0.005) else ''


def candidates(treep, regp, outp):
    tree, reg = load(treep), load(regp)
    read = {f['file'] for f in reg['files']}
    out = [p for p in tree if EXT.search(p) and KW.search(p.split('\\')[-1]) and p not in read and not p.startswith('_')]
    save(outp, out)
    print(json.dumps({'candidates': len(out)}))


def merge(regp, extp, outp, basisp=None, hashesp=None):
    reg, ext = load(regp), load(extp)
    reg = copy.deepcopy(reg)
    for q in reg['quotes']:
        q.setdefault('price_basis', None)
    if basisp:
        basis = load(basisp)
        by_id = {q['quote_id']: q for q in reg['quotes']}
        for k, v in basis.items():
            if int(k) in by_id and (v in BASES or v is None):
                by_id[int(k)]['price_basis'] = v
    known = {f['file'] for f in reg['files']}
    next_id = max([q['quote_id'] for q in reg['quotes']] or [0]) + 1
    docs = {d['doc_id']: d for d in ext.get('docs', [])}
    files = {f['doc_id']: f for f in ext.get('files', [])}
    added = {'files': 0, 'quotes': 0, 'items': 0, 'skipped_known_files': 0}

    def doc_label(d):
        return d['file'] if not d.get('member') else d['file']

    for doc_id, d in docs.items():
        f = files.get(doc_id)
        if not f:
            raise SystemExit(f'no files entry for {doc_id}')
        same = docs.get(f.get('same_as') or '')
        paths = [d['file']] + [c for c in d.get('copies', []) if c != d['file']]
        quotes = [q for q in ext['quotes'] if q['doc_id'] == doc_id]
        for path in paths:
            if path in known and not d.get('member'):
                added['skipped_known_files'] += 1
                continue
            who, pr = split(path)
            dup_of = None if path == d['file'] else d['file']
            if same and path == d['file']:
                dup_of = doc_label(same)
            dup = dup_of is not None
            remark = f.get('remark') or ''
            if d.get('member'):
                remark = f'ไฟล์ใน zip: {d["member"]} — {remark}'.strip(' —')
            reg['files'].append({'file': path, 'person': who, 'pr': pr, 'doc_type': f['doc_type'], 'readable': bool(f.get('readable', True)),
                                 'n_quotes': len(quotes), 'duplicate_of': dup_of, 'remark': remark, **({'member': d['member']} if d.get('member') else {})})
            added['files'] += 1
            for q in quotes:
                qid = next_id
                next_id += 1
                notes = q.get('notes') or ''
                if d.get('member'):
                    notes = f'ไฟล์ใน zip: {d["member"]}; {notes}'.rstrip('; ')
                its = [i for i in ext['items'] if i['doc_id'] == doc_id and i['q'] == q['q']]
                rec = {'quote_id': qid, 'file': path, 'person': who, 'pr': pr, 'doc_type': f['doc_type'], 'vendor': q.get('vendor'),
                       'quote_no': q.get('quote_no'), 'date': q.get('date'), 'customer': q.get('customer'), 'currency': q.get('currency') or 'THB',
                       'subtotal': num(q.get('subtotal')), 'discount': num(q.get('discount')), 'vat': num(q.get('vat')), 'total': num(q.get('total')),
                       'notes': notes or None, 'n_items': len(its), 'duplicate_file': dup, 'vendor_group': q.get('vendor_group') or q.get('vendor'),
                       'price_basis': q.get('price_basis') if q.get('price_basis') in BASES else None}
                # A price table "ไม่รวม VAT" with only one figure: that figure is the amount before VAT.
                if rec['subtotal'] is None and rec['total'] is not None and rec['vat'] is None and re.search(r'ไม่รวม\s*VAT|ไม่รวมภาษี|excl', notes, re.I):
                    rec['subtotal'] = rec['total']
                reg['quotes'].append(rec)
                added['quotes'] += 1
                for i in its:
                    it = {'quote_id': qid, 'pr': pr, 'person': who, 'vendor': rec['vendor'], 'date': rec['date'], 'quote_no': rec['quote_no'],
                          'name': i.get('name'), 'spec': i.get('spec'), 'qty': num(i.get('qty')), 'unit': i.get('unit'),
                          'unit_price': num(i.get('unit_price')), 'amount': num(i.get('amount')), 'duplicate_file': dup, 'file': path,
                          'vendor_group': rec['vendor_group'], 'check': ''}
                    it['check'] = check_note(it)
                    reg['items'].append(it)
                    added['items'] += 1
            known.add(path)

    # New attachments that are byte-identical to a file already in the register: same quotes, flagged duplicate.
    for kc in ext.get('known_copies', []):
        path, src = kc['file'], kc['same_as']
        if path in known:
            added['skipped_known_files'] += 1
            continue
        srcf = next((f for f in reg['files'] if f['file'] == src), None)
        if not srcf:
            raise SystemExit(f'known_copies: {src} is not in the register')
        who, pr = split(path)
        src_quotes = [q for q in reg['quotes'] if q['file'] == src and not q.get('duplicate_file')] or [q for q in reg['quotes'] if q['file'] == src]
        reg['files'].append({**{k: v for k, v in srcf.items()}, 'file': path, 'person': who, 'pr': pr, 'duplicate_of': src})
        added['files'] += 1
        for q in src_quotes:
            qid = next_id
            next_id += 1
            reg['quotes'].append({**q, 'quote_id': qid, 'file': path, 'person': who, 'pr': pr, 'duplicate_file': True})
            added['quotes'] += 1
            for it in [i for i in reg['items'] if i['quote_id'] == q['quote_id']]:
                reg['items'].append({**it, 'quote_id': qid, 'pr': pr, 'person': who, 'file': path, 'duplicate_file': True})
                added['items'] += 1
        known.add(path)

    rec = ext.get('records') or {}
    keymap = {}
    for f in rec.get('files', []):
        reg['files'].append({k: v for k, v in f.items() if not k.startswith('_')})
        added['files'] += 1
    for q in rec.get('quotes', []):
        keymap[q['_k']] = next_id
        r = {k: q.get(k) for k in QUOTE_KEYS if k != 'quote_id'}
        r['quote_id'] = next_id
        next_id += 1
        r['n_items'] = sum(1 for i in rec.get('items', []) if i['_k'] == q['_k'])
        reg['quotes'].append({k: r.get(k) for k in QUOTE_KEYS})
        added['quotes'] += 1
    for i in rec.get('items', []):
        r = {k: i.get(k) for k in ITEM_KEYS if k != 'quote_id'}
        r['quote_id'] = keymap[i['_k']]
        r['check'] = check_note(r)
        reg['items'].append({k: r.get(k) for k in ITEM_KEYS})
        added['items'] += 1

    if hashesp:
        try:
            hashes = load(hashesp)
        except FileNotFoundError:
            hashes = {}
        for d in docs.values():
            if d.get('sha256') and not d.get('member'):
                hashes.setdefault(d['sha256'], d['file'])
        save(hashesp, hashes)
    save(outp, reg)
    print(json.dumps({**added, 'total_files': len(reg['files']), 'total_quotes': len(reg['quotes']), 'total_items': len(reg['items'])}, ensure_ascii=False))


def validate(regp):
    reg = load(regp)
    errors, warns = [], []
    ids = [q['quote_id'] for q in reg['quotes']]
    if len(ids) != len(set(ids)):
        errors.append('duplicate quote_id')
    idset = set(ids)
    n = {}
    for i in reg['items']:
        if i['quote_id'] not in idset:
            errors.append(f'item for unknown quote {i["quote_id"]}')
        n[i['quote_id']] = n.get(i['quote_id'], 0) + 1
    for q in reg['quotes']:
        if (q.get('n_items') or 0) != n.get(q['quote_id'], 0):
            warns.append(f'quote {q["quote_id"]}: n_items {q.get("n_items")} but {n.get(q["quote_id"], 0)} items')
        if q.get('price_basis') not in (None,) + BASES:
            errors.append(f'quote {q["quote_id"]}: price_basis {q.get("price_basis")!r}')
        s, d, v, t = (num(q.get(k)) for k in ('subtotal', 'discount', 'vat', 'total'))
        if s is not None and v is not None and t is not None and abs(s + v - t) > max(2, t * 0.01) and abs(s - (d or 0) + v - t) > max(2, t * 0.01):
            warns.append(f'quote {q["quote_id"]} ({q["pr"]}): subtotal {s} + vat {v} != total {t}')
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', q.get('date') or '0000-00-00'):
            errors.append(f'quote {q["quote_id"]}: date {q.get("date")!r}')
    files = {f['file'] for f in reg['files']}
    for q in reg['quotes']:
        if q['file'] not in files:
            warns.append(f'quote {q["quote_id"]}: file not in files list')
    print(json.dumps({'quotes': len(ids), 'items': len(reg['items']), 'files': len(reg['files']), 'errors': errors[:30], 'n_errors': len(errors),
                      'warnings': warns[:40], 'n_warnings': len(warns),
                      'price_basis': {b: sum(1 for q in reg['quotes'] if q.get('price_basis') == b) for b in BASES}}, ensure_ascii=False, indent=1))
    return 1 if errors else 0


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    opt = lambda name: a[a.index(name) + 1] if name in a else None
    pos = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or not a[i - 1].startswith('--'))]
    if pos[0] == 'candidates':
        candidates(*pos[1:4])
    elif pos[0] == 'merge':
        merge(pos[1], pos[2], pos[3], opt('--basis'), opt('--hashes'))
    elif pos[0] == 'validate':
        sys.exit(validate(pos[1]))
    else:
        print(__doc__)
        sys.exit(2)

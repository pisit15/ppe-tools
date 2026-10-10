"""Verify PPE count/physical size and QR link dimensions in actual exported label bitmaps."""
from pathlib import Path
from io import BytesIO
from collections import deque
import json
from pypdf import PdfReader
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'test-results'
manifest = []
for name, expected_ppe, qr_size in [
    ('ppe-qr-16', 3, 16), ('ppe-qr-20', 3, 20), ('ppe-qr-24', 3, 24),
    ('ppe-nine', 9, 20), ('ppe-none', 0, 20),
]:
    page = PdfReader(root / f'chemical-label-{name}.pdf').pages[0]
    for annotation in page['/Annots']:
        rect = list(map(float, annotation.get_object()['/Rect']))
        assert abs(abs(rect[2] - rect[0]) * 25.4 / 72 - qr_size) < 0.01
    image = Image.open(BytesIO(page.images[0].data)).convert('RGB')
    w, h = image.size
    pixels = image.load()
    blue = {(x,y) for y in range(h) for x in range(w) if pixels[x,y] in ((23,98,173), (0,83,135))}
    circles = []
    while blue:
        start = blue.pop(); queue = deque([start]); xs = []; ys = []
        while queue:
            x,y = queue.popleft(); xs.append(x); ys.append(y)
            for point in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if point in blue: blue.remove(point); queue.append(point)
        width, height = max(xs)-min(xs)+1, max(ys)-min(ys)+1
        # Count the outer 10 mm disk, not enclosed blue details inside the new artwork.
        if width > 105 and height > 105:
            circles.append((width * 25.4/300, height * 25.4/300))
    assert len(circles) == expected_ppe, (name, circles)
    assert all(9.4 <= a <= 10.1 and 9.4 <= b <= 10.1 for a,b in circles), (name, circles)
    (root / f'embedded-{name}.png').write_bytes(page.images[0].data)
    manifest.append({'name': name, 'url': str(page['/Annots'][0].get_object()['/A']['/URI'])})
    print(name, 'PASS', expected_ppe, 'PPE icons within 10 mm; QR', qr_size, 'mm')
(root / 'chemical-label-ppe.json').write_text(json.dumps(manifest), encoding='utf-8')

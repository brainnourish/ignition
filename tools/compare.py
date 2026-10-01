# Side-by-side: our frame (left) vs NASA reference (right), rows. python3 tools/compare.py out.jpg ours1 ref1 ours2 ref2 ...
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
H = 420
rows = []
for i in range(0, len(files), 2):
    ims = [Image.open(f).convert('RGB') for f in files[i:i + 2]]
    ims = [im.resize((int(im.width * H / im.height), H), Image.LANCZOS) for im in ims]
    row = Image.new('RGB', (sum(im.width for im in ims) + 8, H), (20, 20, 20))
    x = 0
    for im, f in zip(ims, files[i:i + 2]):
        ImageDraw.Draw(im).text((8, 6), f.split('/')[-1], fill=(255, 255, 0)); row.paste(im, (x, 0)); x += im.width + 8
    rows.append(row)
W = max(r.width for r in rows)
sheet = Image.new('RGB', (W, H * len(rows) + 8 * (len(rows) - 1)), (20, 20, 20))
for k, r in enumerate(rows): sheet.paste(r, (0, k * (H + 8)))
sheet.save(out, quality=90)

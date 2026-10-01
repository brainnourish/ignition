# Contact sheet: python3 tools/sheet.py out.jpg cols img1 img2 ...  (labels = file stems)
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f).convert('RGB') for f in files]
w = 720; h = int(ims[0].height * w / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h), (20, 20, 20))
for i, (im, f) in enumerate(zip(ims, files)):
    im = im.resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    d.text((8, 6), f.split('/')[-1].rsplit('.', 1)[0], fill=(255, 255, 0))
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save(out, quality=88)

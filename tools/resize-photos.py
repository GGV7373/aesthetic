"""Shrinks the photos in assets/img/photos/ in place: 1600px on the longest side,
   JPEG quality 80. Files already small enough are left alone, so it is safe to
   run again after adding photos. Needs Pillow (pip install pillow).

   Run:  python tools/resize-photos.py                                       """
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

MAX_SIDE = 1600
SMALL_ENOUGH = 1024 * 1024
ROOT = Path(__file__).resolve().parent.parent

Image.MAX_IMAGE_PIXELS = None  # these are our own files, and some are huge

before = after = changed = 0
for path in sorted((ROOT / 'assets/img/photos').glob('*/*.jpg')):
    original = path.read_bytes()
    before += len(original)
    with Image.open(BytesIO(original)) as source:
        if max(source.size) <= MAX_SIDE and len(original) <= SMALL_ENOUGH:
            after += len(original)
            continue
        icc = source.info.get('icc_profile') if source.mode == 'RGB' else None
        image = ImageOps.exif_transpose(source).convert('RGB')

    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = BytesIO()
    image.save(out, 'JPEG', quality=80, optimize=True, progressive=True, icc_profile=icc)

    if out.tell() >= len(original):
        after += len(original)
        continue
    temp = path.with_suffix('.tmp')
    temp.write_bytes(out.getvalue())
    temp.replace(path)
    after += out.tell()
    changed += 1

print(f'{changed} resized: {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB')

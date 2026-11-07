"""Shrinks the photos in assets/img/photos/ in place: 1600px on the longest side,
   JPEG quality 80. Files already small enough are left alone, so it is safe to
   run again after adding photos. Also writes <aesthetic>/thumb/<aesthetic>.jpg,
   480px, for the home page's small gallery tiles (rebuilt when the photo is newer).
   Needs Pillow (pip install pillow).

   Run:  python tools/resize-photos.py                                       """
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

MAX_SIDE = 1600
THUMB_SIDE = 480  # gallery tiles are 176x120 CSS px; enough for 2x screens
SMALL_ENOUGH = 1024 * 1024
ROOT = Path(__file__).resolve().parent.parent

Image.MAX_IMAGE_PIXELS = None  # these are our own files, and some are huge


def encode(image, side, icc):
    image = image.copy()
    image.thumbnail((side, side), Image.LANCZOS)
    out = BytesIO()
    image.save(out, 'JPEG', quality=80, optimize=True, progressive=True, icc_profile=icc)
    return out.getvalue()


def write(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_bytes(data)
    temp.replace(path)


before = after = changed = thumbs = 0
for path in sorted((ROOT / 'assets/img/photos').glob('*/*.jpg')):
    original = path.read_bytes()
    before += len(original)
    thumb = path.parent / 'thumb' / path.name
    with Image.open(BytesIO(original)) as source:
        icc = source.info.get('icc_profile') if source.mode == 'RGB' else None
        image = ImageOps.exif_transpose(source).convert('RGB')

    if max(image.size) <= MAX_SIDE and len(original) <= SMALL_ENOUGH:
        after += len(original)
    else:
        out = encode(image, MAX_SIDE, icc)
        if len(out) >= len(original):
            after += len(original)
        else:
            write(path, out)
            after += len(out)
            changed += 1

    if not thumb.exists() or thumb.stat().st_mtime < path.stat().st_mtime:
        thumb.parent.mkdir(exist_ok=True)
        write(thumb, encode(image, THUMB_SIDE, icc))
        thumbs += 1

print(f'{changed} resized: {before / 1048576:.1f} MB -> {after / 1048576:.1f} MB; {thumbs} thumbnails written')

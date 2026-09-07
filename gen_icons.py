# -*- coding: utf-8 -*-
"""Генерирует PWA-иконки ConjuMaster: icon-192.png, icon-512.png, apple-touch-icon.png (180)."""
from PIL import Image, ImageDraw, ImageFont
import os

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\segoeuib.ttf',
    r'C:\Windows\Fonts\arialbd.ttf',
    r'C:\Windows\Fonts\arial.ttf',
]

def find_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def rounded_gradient(size, radius_ratio=0.25):
    c1 = (16, 185, 129)   # --green
    c2 = (14, 165, 233)   # --blue
    base = Image.new('RGB', (size, size))
    px = base.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = round(c1[0] + (c2[0] - c1[0]) * t)
        g = round(c1[1] + (c2[1] - c1[1]) * t)
        b = round(c1[2] + (c2[2] - c1[2]) * t)
        for x in range(size):
            # лёгкая диагональ: примешиваем x
            t2 = min(1.0, max(0.0, t * 0.85 + (x / size) * 0.15))
            px[x, y] = (round(c1[0] + (c2[0] - c1[0]) * t2),
                        round(c1[1] + (c2[1] - c1[1]) * t2),
                        round(c1[2] + (c2[2] - c1[2]) * t2))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=int(size * radius_ratio), fill=255)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    img.paste(base, (0, 0))
    img.putalpha(mask)
    return img

def draw_art(img):
    s = img.size[0]
    d = ImageDraw.Draw(img)
    # белая Ç по центру (с запасом под maskable-обрезку)
    font = find_font(int(s * 0.44))
    t = 'Ç'
    bb = d.textbbox((0, 0), t, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((s - tw) / 2 - bb[0], (s - th) / 2 - bb[1] - s * 0.015), t, font=font, fill=(255, 255, 255, 255))
    return img

big = draw_art(rounded_gradient(512))
big.save('icon-512.png')
big.resize((192, 192), Image.LANCZOS).save('icon-192.png')
# apple-touch-icon: без прозрачности, на случай старых iOS
bg = Image.new('RGB', (180, 180), (16, 185, 129))
bg.paste(draw_art(rounded_gradient(512)).resize((180, 180), Image.LANCZOS), (0, 0),
         draw_art(rounded_gradient(512)).resize((180, 180), Image.LANCZOS))
bg.save('apple-touch-icon.png')
print('icons written')

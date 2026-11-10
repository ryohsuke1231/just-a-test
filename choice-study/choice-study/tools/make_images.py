"""画像を作るスクリプト（python3 tools/make_images.py）
- 互角の組 e01〜e06：模様を自動で生成（著作権の問題なし）
- 中くらい m01〜m04・はっきり s01〜s02：仮の画像（ラベル付き）。本番前に写真へ差し替える
"""
import colorsys
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 800, 600
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "images")
os.makedirs(OUT, exist_ok=True)


def save(img, name):
    img.convert("RGB").save(os.path.join(OUT, name), quality=86)


def pal(h, n=5, s=0.45, v0=0.55, v1=0.95, spread=0.08):
    """色相hのまわりの落ち着いた配色"""
    cols = []
    for i in range(n):
        t = i / (n - 1)
        r, g, b = colorsys.hsv_to_rgb((h + (t - 0.5) * spread) % 1, s * (1 - 0.5 * t), v0 + (v1 - v0) * t)
        cols.append((int(r * 255), int(g * 255), int(b * 255)))
    return cols


def waves(seed, hue):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:H, 0:W]
    f = np.zeros((H, W))
    for _ in range(5):
        a, b = rng.uniform(-0.02, 0.02, 2)
        f += np.sin(x * a + y * b + rng.uniform(0, 6.28)) * rng.uniform(0.5, 1)
    f = (f - f.min()) / (f.max() - f.min())
    cols = np.array(pal(hue, 6))
    idx = np.clip((f * 6).astype(int), 0, 5)
    return Image.fromarray(cols[idx].astype("uint8"))


def dots(seed, hue):
    rng = np.random.default_rng(seed)
    cols = pal(hue, 5, s=0.5)
    img = Image.new("RGB", (W, H), cols[-1])
    d = ImageDraw.Draw(img)
    step = 80
    for gy in range(-1, H // step + 2):
        for gx in range(-1, W // step + 2):
            r = rng.uniform(12, 36)
            cx = gx * step + step / 2 + rng.uniform(-10, 10)
            cy = gy * step + step / 2 + rng.uniform(-10, 10)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=cols[rng.integers(0, 4)])
    return img


def blobs(seed, hue):
    rng = np.random.default_rng(seed)
    cols = pal(hue, 5, s=0.55, spread=0.18)
    img = Image.new("RGB", (W, H), cols[-1])
    d = ImageDraw.Draw(img)
    for _ in range(9):
        r = rng.uniform(120, 260)
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=cols[rng.integers(0, 4)])
    return img.filter(ImageFilter.GaussianBlur(60))


def stripes(seed, hue):
    rng = np.random.default_rng(seed)
    cols = pal(hue, 5, s=0.42)
    big = Image.new("RGB", (W * 2, H * 2), cols[-1])
    d = ImageDraw.Draw(big)
    x = 0
    while x < W * 2:
        w = int(rng.uniform(24, 90))
        d.rectangle([x, 0, x + w, H * 2], fill=cols[rng.integers(0, 5)])
        x += w
    ang = rng.choice([-35, -25, 25, 35])
    big = big.rotate(ang, resample=Image.BICUBIC)
    return big.crop((W // 2, H // 2, W // 2 + W, H // 2 + H))


def rings(seed, hue):
    rng = np.random.default_rng(seed)
    cols = pal(hue, 5, s=0.48)
    img = Image.new("RGB", (W, H), cols[-1])
    d = ImageDraw.Draw(img)
    for _ in range(4):
        cx, cy = rng.uniform(100, W - 100), rng.uniform(80, H - 80)
        n = int(rng.integers(4, 7))
        for i in range(n, 0, -1):
            r = i * rng.uniform(26, 34)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=cols[(i + n) % 5])
    return img


def triangles(seed, hue):
    rng = np.random.default_rng(seed)
    cols = pal(hue, 6, s=0.5)
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    s = 100
    hgt = s * 0.866
    row = 0
    y = -hgt
    while y < H + hgt:
        off = -s / 2 if row % 2 else 0
        x = off - s
        while x < W + s:
            d.polygon([(x, y), (x + s, y), (x + s / 2, y + hgt)], fill=cols[rng.integers(0, 6)])
            d.polygon([(x + s / 2, y + hgt), (x + s, y), (x + s * 1.5, y + hgt)], fill=cols[rng.integers(0, 6)])
            x += s
        y += hgt
        row += 1
    return img


# 互角の組：同じ作り方・同じ色合いで、並び方だけが違う2枚
EVEN = [
    ("e01", waves, 0.58, (11, 47)),
    ("e02", dots, 0.08, (5, 23)),
    ("e03", blobs, 0.75, (8, 31)),
    ("e04", stripes, 0.38, (14, 52)),
    ("e05", rings, 0.96, (3, 19)),
    ("e06", triangles, 0.5, (27, 64)),
]
for pid, fn, hue, (sa, sb) in EVEN:
    save(fn(sa, hue), f"{pid}a.jpg")
    save(fn(sb, hue), f"{pid}b.jpg")

# 仮の画像（写真に差し替える前提）
PLACE = [
    ("m01a", "海", 0.56), ("m01b", "山", 0.33),
    ("m02a", "桜", 0.93), ("m02b", "紅葉", 0.04),
    ("m03a", "都会", 0.62), ("m03b", "田舎", 0.27),
    ("m04a", "朝日", 0.09), ("m04b", "星空", 0.68),
    ("s01a", "犬", 0.1), ("s01b", "猫", 0.8),
    ("s02a", "パン", 0.12), ("s02b", "ごはん", 0.16),
]
font = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 150)
small = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 30)
for name, label, hue in PLACE:
    c = pal(hue, 3, s=0.4, v0=0.5, v1=0.8)
    img = Image.new("RGB", (W, H), c[0])
    d = ImageDraw.Draw(img)
    d.rectangle([0, H * 0.6, W, H], fill=c[1])
    d.text((W / 2, H / 2 - 20), label, font=font, fill="white", anchor="mm")
    d.text((W / 2, H - 50), "仮の画像（写真に差し替え）", font=small, fill="white", anchor="mm")
    save(img, f"{name}.jpg")

print("done", len(os.listdir(OUT)), "files")

#!/usr/bin/env python3
"""產生 icons/ 與 splash/ 的 PNG。色票與 tokens.css 一致（純黑背景、亮紫強調色）。
用法：python3 tools_gen_assets.py"""
from PIL import Image, ImageDraw

BLACK = (0, 0, 0)            # --c-bg
ACCENT = (158, 123, 255)     # --c-accent


def draw_check(img, cx, cy, size, color, width_ratio=0.16):
    """在 (cx, cy) 畫一個寬 size 的勾。線端補圓形當圓角。"""
    d = ImageDraw.Draw(img)
    w = max(2, int(size * width_ratio))
    pts = [(-0.30, 0.06), (-0.08, 0.28), (0.32, -0.26)]
    pts = [(cx + x * size, cy + y * size) for x, y in pts]
    d.line(pts, fill=color, width=w, joint="curve")
    for x, y in pts:
        r = w / 2
        d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def icon(size, check_scale=0.58):
    """App 圖示：亮紫底、純黑勾（在主畫面上辨識度最高）。"""
    img = Image.new("RGB", (size, size), ACCENT)
    draw_check(img, size / 2, size / 2, size * check_scale, BLACK)
    return img


def splash(w, h, check_px):
    """開機圖：必須與 App 啟動後的背景同色（純黑），否則冷啟動會閃色。"""
    img = Image.new("RGB", (w, h), BLACK)
    draw_check(img, w / 2, h / 2, check_px, ACCENT)
    return img


if __name__ == "__main__":
    icon(180).save("icons/icon-180.png")
    icon(192).save("icons/icon-192.png")
    icon(512).save("icons/icon-512.png")
    # maskable：圖形限制在中央，四周留給系統裁切
    icon(512, check_scale=0.40).save("icons/icon-512-maskable.png")
    # iPhone 15 Pro：393x852 @3x
    splash(1179, 2556, 320).save("splash/splash-1179x2556.png")
    print("assets written")

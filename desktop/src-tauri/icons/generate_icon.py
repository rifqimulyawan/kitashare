"""Generate KitaShare app icon - a monitor with share arrows on gradient background."""
from PIL import Image, ImageDraw
import math

SIZE = 1024

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background with gradient
    radius = size // 6
    # Draw gradient background
    for y in range(size):
        ratio = y / size
        r = int(59 + (139 - 59) * ratio)   # 3B -> 8B
        g = int(130 + (92 - 130) * ratio)   # 82 -> 5C
        b = int(246 + (246 - 246) * ratio)  # F6 -> F6
        for x in range(size):
            # Check if inside rounded rect
            in_rect = True
            # Check corners
            corners = [(radius, radius), (size - radius, radius), (radius, size - radius), (size - radius, size - radius)]
            if x < radius and y < radius:
                if math.hypot(x - radius, y - radius) > radius:
                    in_rect = False
            elif x > size - radius and y < radius:
                if math.hypot(x - (size - radius), y - radius) > radius:
                    in_rect = False
            elif x < radius and y > size - radius:
                if math.hypot(x - radius, y - (size - radius)) > radius:
                    in_rect = False
            elif x > size - radius and y > size - radius:
                if math.hypot(x - (size - radius), y - (size - radius)) > radius:
                    in_rect = False
            if in_rect:
                img.putpixel((x, y), (r, g, b, 255))

    draw = ImageDraw.Draw(img)

    cx, cy = size // 2, size // 2
    scale = size / 1024

    # Monitor screen (white rounded rect)
    mw = int(520 * scale)
    mh = int(360 * scale)
    mx = cx - mw // 2
    my = cy - mh // 2 - int(40 * scale)
    mr = int(20 * scale)

    # Draw monitor screen with subtle shadow
    # Shadow
    for offset in range(int(8 * scale), 0, -1):
        alpha = int(30 * (offset / (8 * scale)))
        draw.rounded_rectangle(
            [mx - offset, my + offset, mx + mw + offset, my + mh + offset],
            radius=mr + offset,
            fill=(0, 0, 0, alpha)
        )

    # Screen background (dark)
    draw.rounded_rectangle(
        [mx, my, mx + mw, my + mh],
        radius=mr,
        fill=(30, 41, 59, 255)  # slate-800
    )

    # Screen inner highlight
    draw.rounded_rectangle(
        [mx + int(8 * scale), my + int(8 * scale), mx + mw - int(8 * scale), my + mh - int(8 * scale)],
        radius=mr - int(4 * scale),
        fill=(15, 23, 42, 255)  # slate-900
    )

    # Monitor stand
    stand_w = int(120 * scale)
    stand_h = int(30 * scale)
    stand_x = cx - stand_w // 2
    stand_y = my + mh
    draw.rounded_rectangle(
        [stand_x, stand_y, stand_x + stand_w, stand_y + stand_h],
        radius=int(6 * scale),
        fill=(30, 41, 59, 255)
    )

    # Monitor base
    base_w = int(200 * scale)
    base_h = int(16 * scale)
    base_x = cx - base_w // 2
    base_y = stand_y + stand_h
    draw.rounded_rectangle(
        [base_x, base_y, base_x + base_w, base_y + base_h],
        radius=int(8 * scale),
        fill=(30, 41, 59, 255)
    )

    # Share arrows on screen (white/light blue)
    arrow_color = (96, 165, 250, 255)  # blue-400
    arrow_w = int(8 * scale)
    arrow_len = int(120 * scale)
    gap = int(50 * scale)

    # Left arrow (pointing right) - top
    ax1 = cx - gap // 2 - arrow_len
    ay1 = my + int(100 * scale)
    # Arrow shaft
    draw.rounded_rectangle(
        [ax1, ay1 - arrow_w // 2, ax1 + arrow_len, ay1 + arrow_w // 2],
        radius=arrow_w // 2,
        fill=arrow_color
    )
    # Arrow head
    head_size = int(24 * scale)
    draw.polygon([
        (ax1 + arrow_len, ay1 - head_size),
        (ax1 + arrow_len + head_size, ay1),
        (ax1 + arrow_len, ay1 + head_size),
    ], fill=arrow_color)

    # Right arrow (pointing left) - bottom
    ax2 = cx + gap // 2
    ay2 = my + int(200 * scale)
    # Arrow shaft
    draw.rounded_rectangle(
        [ax2, ay2 - arrow_w // 2, ax2 + arrow_len, ay2 + arrow_w // 2],
        radius=arrow_w // 2,
        fill=(255, 255, 255, 230)
    )
    # Arrow head
    draw.polygon([
        (ax2, ay2 - head_size),
        (ax2 - head_size, ay2),
        (ax2, ay2 + head_size),
    ], fill=(255, 255, 255, 230))

    # Small connection dots between arrows
    dot_r = int(6 * scale)
    for i in range(3):
        dy = ay1 + (ay2 - ay1) * (i + 1) // 4
        draw.ellipse(
            [cx - dot_r, dy - dot_r, cx + dot_r, dy + dot_r],
            fill=(96, 165, 250, 180)
        )

    return img

# Generate main 1024x1024 icon
icon = create_icon(1024)
icon.save(r"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\icon.png")

# Generate various sizes
for sz in [32, 64, 128, 256, 512]:
    small = create_icon(sz)
    small.save(rf"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\{sz}x{sz}.png")

# 128x128@2x
icon_256 = create_icon(256)
icon_256.save(r"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\128x128@2x.png")

# Windows store logos
for sz, name in [(30, "Square30x30Logo"), (44, "Square44x44Logo"), (71, "Square71x71Logo"),
                  (89, "Square89x89Logo"), (107, "Square107x107Logo"), (142, "Square142x142Logo"),
                  (150, "Square150x150Logo"), (284, "Square284x284Logo"), (310, "Square310x310Logo")]:
    img_sz = create_icon(sz)
    img_sz.save(rf"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\{name}.png")

# StoreLogo (50x50)
store_logo = create_icon(50)
store_logo.save(r"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\StoreLogo.png")

# Generate ICO (Windows)
ico_icon = create_icon(256)
ico_icon.save(r"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\icon.ico",
              format='ICO', sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])

# Generate ICNS (macOS) - Pillow doesn't support ICNS directly on all platforms
# but we can try
try:
    icns_icon = create_icon(512)
    icns_icon.save(r"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\icon.icns",
                   format='ICNS')
except Exception as e:
    print(f"ICNS generation skipped: {e}")

print("All icons generated successfully!")

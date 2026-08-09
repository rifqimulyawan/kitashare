"""Generate KitaShare app icon - matches header logo: blue rounded square with white monitor icon."""
from PIL import Image, ImageDraw
import math

SIZE = 1024
# Primary blue color (blue-500 / #3b82f6)
BG_COLOR = (59, 130, 246, 255)
# White for the monitor icon
ICON_COLOR = (255, 255, 255, 255)

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded square background (blue)
    radius = size // 6
    draw.rounded_rectangle(
        [0, 0, size - 1, size - 1],
        radius=radius,
        fill=BG_COLOR
    )

    scale = size / 1024
    cx, cy = size // 2, size // 2

    # Monitor screen (white rounded rect) - matches lucide Monitor icon
    # Monitor: rect x=2 y=3 w=20 h=14 rx=2, line 8,21 to 16,21, line 12,17 to 12,21
    # Scale to icon size with padding
    mw = int(560 * scale)
    mh = int(390 * scale)
    mx = cx - mw // 2
    my = cy - mh // 2 - int(30 * scale)
    mr = int(30 * scale)

    # Monitor screen outline (white)
    line_w = max(int(24 * scale), 2)
    draw.rounded_rectangle(
        [mx, my, mx + mw, my + mh],
        radius=mr,
        outline=ICON_COLOR,
        width=line_w
    )

    # Monitor stand (horizontal line at bottom)
    stand_w = int(200 * scale)
    stand_y = my + mh + int(20 * scale)
    stand_x = cx - stand_w // 2
    draw.rounded_rectangle(
        [stand_x, stand_y - line_w // 2, stand_x + stand_w, stand_y + line_w // 2],
        radius=line_w // 2,
        fill=ICON_COLOR
    )

    # Monitor base connector (vertical line)
    connector_h = int(50 * scale)
    connector_x = cx
    connector_top = my + mh
    draw.rounded_rectangle(
        [connector_x - line_w // 2, connector_top,
         connector_x + line_w // 2, connector_top + connector_h],
        radius=line_w // 2,
        fill=ICON_COLOR
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

# Generate ICNS (macOS)
try:
    icns_icon = create_icon(512)
    icns_icon.save(r"e:\Standalone Apps Work\rmshare-apps\desktop\src-tauri\icons\icon.icns",
                   format='ICNS')
except Exception as e:
    print(f"ICNS generation skipped: {e}")

print("All icons generated successfully!")

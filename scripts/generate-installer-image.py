"""Generates the animation the Squirrel installer shows while it installs.

Requires Pillow: python -m pip install pillow
Run from the repository root: python scripts/generate-installer-image.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "installer" / "squirrel-loading.gif"
LOGO = Image.open(ROOT / "src" / "assets" / "icons" / "ytmd.png").convert("RGBA")

APP_NAME = "YouTube Music Premium"
SUBTITLE = "Wird installiert"
BACKGROUND_TOP = (22, 20, 30)
BACKGROUND_BOTTOM = (10, 9, 13)
TRACK = (48, 46, 56)
ACCENT = (232, 49, 76)
ACCENT_SOFT = (255, 104, 126)
TEXT = (255, 255, 255)
TEXT_MUTED = (150, 148, 158)
SCALE = 2  # Render at 2x and downsample for smooth edges


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (Path("C:/Windows/Fonts") / name, ROOT / "src" / "assets" / "fonts" / "WorkSans-VariableFont_wght.ttf"):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size * SCALE)
    return ImageFont.load_default()


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    gradient = Image.new("RGBA", (1, height))
    draw = ImageDraw.Draw(gradient)
    for y in range(height):
        blend = y / max(height - 1, 1)
        draw.point((0, y), fill=tuple(round(top[i] + (bottom[i] - top[i]) * blend) for i in range(3)) + (255,))
    return gradient.resize((width, height), Image.BILINEAR)


def glow(size: tuple[int, int], center: tuple[int, int], radius: int, strength: int) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    cx, cy = center
    ImageDraw.Draw(layer).ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(*ACCENT, strength))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.55))


def centered_text(draw: ImageDraw.ImageDraw, width: int, y: int, text: str, fnt: ImageFont.FreeTypeFont, fill) -> None:
    left, _, right, _ = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((width - (right - left)) // 2, y), text, font=fnt, fill=fill)


def build() -> None:
    width, height = 460, 300
    w, h = width * SCALE, height * SCALE
    frame_count = 48
    logo_center = (w // 2, 96 * SCALE)
    bar_width, bar_height = 260 * SCALE, 5 * SCALE
    bar_x, bar_y = (w - bar_width) // 2, 246 * SCALE
    segment = 92 * SCALE

    base = vertical_gradient((w, h), BACKGROUND_TOP, BACKGROUND_BOTTOM)
    base.alpha_composite(glow((w, h), logo_center, 84 * SCALE, 66))
    logo_size = 104 * SCALE
    base.alpha_composite(LOGO.resize((logo_size, logo_size), Image.LANCZOS), (logo_center[0] - logo_size // 2, logo_center[1] - logo_size // 2))

    draw = ImageDraw.Draw(base)
    centered_text(draw, w, 172 * SCALE, APP_NAME, font("seguisb.ttf", 23), TEXT)
    centered_text(draw, w, 206 * SCALE, SUBTITLE, font("segoeui.ttf", 13), TEXT_MUTED)
    draw.rounded_rectangle((bar_x, bar_y, bar_x + bar_width, bar_y + bar_height), radius=bar_height // 2, fill=TRACK)

    frames = []
    for index in range(frame_count):
        position = 0.5 - 0.5 * math.cos(index / frame_count * 2 * math.pi)  # Ease in and out, back and forth
        x = bar_x + int((bar_width - segment) * position)
        frame = base.copy()
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        bar = ImageDraw.Draw(overlay)
        # Soft trail behind the moving segment, then the segment itself
        bar.rounded_rectangle((x - segment // 3, bar_y, x + segment + segment // 3, bar_y + bar_height), radius=bar_height // 2, fill=(*ACCENT, 60))
        bar.rounded_rectangle((x, bar_y, x + segment, bar_y + bar_height), radius=bar_height // 2, fill=(*ACCENT_SOFT, 255))
        frame.alpha_composite(overlay)
        frames.append(frame.resize((width, height), Image.LANCZOS).convert("RGB"))

    # One shared palette for every frame so the static parts don't shimmer
    palette = frames[frame_count // 4].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    paletted = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    paletted[0].save(OUT, save_all=True, append_images=paletted[1:], duration=40, loop=0, optimize=False)
    print("Generated", OUT)


if __name__ == "__main__":
    build()

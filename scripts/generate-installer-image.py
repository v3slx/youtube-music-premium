"""Generates the animation the Squirrel installer shows while it installs.

Requires Pillow: python -m pip install pillow
Run from the repository root: python scripts/generate-installer-image.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "installer" / "squirrel-loading.gif"
LOGO = Image.open(ROOT / "src" / "assets" / "icons" / "ytmd.png").convert("RGBA")

APP_NAME = "YouTube Music Premium"
SUBTITLE = "Wird installiert"
# Flat colours only: gradients and glows band into visible steps with the 256 colour GIF palette
BACKGROUND = (16, 15, 21)
TRACK = (44, 42, 52)
ACCENT = (240, 64, 90)
TEXT = (255, 255, 255)
TEXT_MUTED = (150, 148, 158)
SCALE = 2  # Render at 2x and downsample for smooth edges


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (Path("C:/Windows/Fonts") / name, ROOT / "src" / "assets" / "fonts" / "WorkSans-VariableFont_wght.ttf"):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size * SCALE)
    return ImageFont.load_default()


def centered_text(draw: ImageDraw.ImageDraw, width: int, y: int, text: str, fnt: ImageFont.FreeTypeFont, fill) -> None:
    left, _, right, _ = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((width - (right - left)) // 2, y), text, font=fnt, fill=fill)


def build() -> None:
    width, height = 460, 300
    w, h = width * SCALE, height * SCALE
    frame_count = 48
    bar_width, bar_height = 260 * SCALE, 5 * SCALE
    bar_x, bar_y = (w - bar_width) // 2, 246 * SCALE
    segment = 92 * SCALE

    base = Image.new("RGBA", (w, h), (*BACKGROUND, 255))
    logo_size = 104 * SCALE
    base.alpha_composite(LOGO.resize((logo_size, logo_size), Image.LANCZOS), ((w - logo_size) // 2, 96 * SCALE - logo_size // 2))
    draw = ImageDraw.Draw(base)
    centered_text(draw, w, 172 * SCALE, APP_NAME, font("seguisb.ttf", 23), TEXT)
    centered_text(draw, w, 206 * SCALE, SUBTITLE, font("segoeui.ttf", 13), TEXT_MUTED)
    draw.rounded_rectangle((bar_x, bar_y, bar_x + bar_width, bar_y + bar_height), radius=bar_height // 2, fill=TRACK)

    frames = []
    for index in range(frame_count):
        position = 0.5 - 0.5 * math.cos(index / frame_count * 2 * math.pi)  # Ease in and out, back and forth
        x = bar_x + int((bar_width - segment) * position)
        frame = base.copy()
        ImageDraw.Draw(frame).rounded_rectangle((x, bar_y, x + segment, bar_y + bar_height), radius=bar_height // 2, fill=(*ACCENT, 255))
        frames.append(frame.resize((width, height), Image.LANCZOS).convert("RGB"))

    palette = frames[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    paletted = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # disposal=2 makes Pillow store every frame in full instead of only the changed rectangle. Partial frames that
    # stay on screen (disposal 0/1) are not drawn correctly by the Squirrel installer and leave trails behind
    paletted[0].save(OUT, save_all=True, append_images=paletted[1:], duration=40, loop=0, optimize=False, disposal=2)
    print("Generated", OUT)


if __name__ == "__main__":
    build()

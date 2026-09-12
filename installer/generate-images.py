"""Generates the installer artwork (Squirrel loading GIF, NSIS sidebar/header BMPs).

Requires Pillow: python -m pip install pillow
Run from the repository root: python installer/generate-images.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "installer"
LOGO = Image.open(ROOT / "src" / "assets" / "icons" / "ytmd.png").convert("RGBA")

APP_NAME = "YouTube Music Premium"
BACKGROUND = (15, 15, 18)
TRACK = (42, 42, 48)
ACCENT = (232, 49, 76)
TEXT = (255, 255, 255)
TEXT_MUTED = (154, 154, 160)
SCALE = 2  # Render at 2x and downsample for smooth edges


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (Path("C:/Windows/Fonts") / name, ROOT / "src" / "assets" / "fonts" / "WorkSans-VariableFont_wght.ttf"):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size * SCALE)
    return ImageFont.load_default()


def glow(size: tuple[int, int], center: tuple[int, int], radius: int, strength: int) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx, cy = center
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(*ACCENT, strength))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.6))


def paste_logo(canvas: Image.Image, center: tuple[int, int], size: int) -> None:
    logo = LOGO.resize((size, size), Image.LANCZOS)
    canvas.alpha_composite(logo, (center[0] - size // 2, center[1] - size // 2))


def centered_text(draw: ImageDraw.ImageDraw, width: int, y: int, text: str, fnt: ImageFont.FreeTypeFont, fill) -> None:
    left, _, right, _ = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((width - (right - left)) // 2, y), text, font=fnt, fill=fill)


def squirrel_loading_gif() -> None:
    width, height = 440, 280
    w, h = width * SCALE, height * SCALE
    frame_count = 40
    bar_width, bar_height = 240 * SCALE, 4 * SCALE
    bar_x, bar_y = (w - bar_width) // 2, 232 * SCALE
    segment = 84 * SCALE

    base = Image.new("RGBA", (w, h), (*BACKGROUND, 255))
    base.alpha_composite(glow((w, h), (w // 2, 78 * SCALE), 70 * SCALE, 70))
    paste_logo(base, (w // 2, 78 * SCALE), 92 * SCALE)
    draw = ImageDraw.Draw(base)
    centered_text(draw, w, 146 * SCALE, APP_NAME, font("seguisb.ttf", 22), TEXT)
    centered_text(draw, w, 182 * SCALE, "Wird installiert \u2026", font("segoeui.ttf", 13), TEXT_MUTED)
    draw.rounded_rectangle((bar_x, bar_y, bar_x + bar_width, bar_y + bar_height), radius=bar_height // 2, fill=TRACK)

    frames = []
    for i in range(frame_count):
        t = i / frame_count
        eased = 0.5 - 0.5 * math.cos(t * 2 * math.pi)  # Ease in/out, back and forth
        x = bar_x + int((bar_width - segment) * eased)
        frame = base.copy()
        ImageDraw.Draw(frame).rounded_rectangle((x, bar_y, x + segment, bar_y + bar_height), radius=bar_height // 2, fill=ACCENT)
        frames.append(frame.resize((width, height), Image.LANCZOS).convert("RGB"))

    # One shared palette for all frames so the static parts don't shimmer
    palette = frames[frame_count // 4].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    paletted = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    paletted[0].save(OUT / "squirrel-loading.gif", save_all=True, append_images=paletted[1:], duration=45, loop=0, optimize=False)


def nsis_sidebar() -> None:
    width, height = 164, 314
    w, h = width * SCALE, height * SCALE
    canvas = Image.new("RGBA", (w, h), (*BACKGROUND, 255))
    canvas.alpha_composite(glow((w, h), (w // 2, 92 * SCALE), 60 * SCALE, 80))
    paste_logo(canvas, (w // 2, 92 * SCALE), 76 * SCALE)
    draw = ImageDraw.Draw(canvas)
    centered_text(draw, w, 150 * SCALE, "YouTube Music", font("seguisb.ttf", 16), TEXT)
    centered_text(draw, w, 172 * SCALE, "Premium", font("seguisb.ttf", 16), ACCENT)
    centered_text(draw, w, 284 * SCALE, "Custom Build", font("segoeui.ttf", 10), TEXT_MUTED)
    canvas.resize((width, height), Image.LANCZOS).convert("RGB").save(OUT / "sidebar.bmp")


def nsis_header() -> None:
    width, height = 150, 57
    w, h = width * SCALE, height * SCALE
    canvas = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    paste_logo(canvas, (w - 30 * SCALE, h // 2), 38 * SCALE)
    canvas.resize((width, height), Image.LANCZOS).convert("RGB").save(OUT / "header.bmp")


if __name__ == "__main__":
    squirrel_loading_gif()
    nsis_sidebar()
    nsis_header()
    print("Generated installer images in", OUT)
